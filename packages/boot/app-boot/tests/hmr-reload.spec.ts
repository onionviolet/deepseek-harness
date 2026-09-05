import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Hmr from '@deepseek-ai/cordis-plugin-hmr'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import { afterEach, describe, expect, it } from 'vitest'

// Regression home for the vendored HMR plugin's module-reload path, beside the
// exact-config cases in hmr-config.spec.ts. These pin the three upstream fixes
// the harness carries: a stale plugin is rebuilt once and only under a live
// parent, a rebuild that fails leaves the row failed instead of rolling the
// batch back, and a missing loader-internals API disables module reloading
// without disabling the service.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Create a temp project directory that is removed after the test. */
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-hmr-reload-'))
  dirs.push(dir)
  return dir
}

/**
 * Create a temp project directory INSIDE this package's tests directory, so
 * fixture modules can resolve workspace packages through the ordinary upward
 * `node_modules` lookup. Removed after the test.
 */
function localProject(): string {
  const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.hmr-reload-'))
  dirs.push(dir)
  return dir
}

/** Boot loader + timer + HMR over `dir`, optionally hiding the loader internals. */
async function boot(dir: string, options: { internals?: boolean; warnings?: string[] } = {}): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader)
  if (options.internals === false) {
    // The loader is the only holder of the internals; clearing it reproduces a
    // runtime that reaches neither --expose-internals nor the builtin bridge.
    ctx.loader.internal = undefined
  }
  const { warnings } = options
  if (warnings) {
    ctx.logger.exporter({
      export(message) {
        if (message.type === 'warn') warnings.push(message.args.map(String).join(' '))
      },
    })
  }
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, { root: ['.'], ignored: [], debounce: 0 })
  return ctx
}

/**
 * Rewrite `path` until `test` holds, or fail with `message`. A single write can
 * land inside the watcher's atomic-write window and coalesce with the previous
 * one; each rewrite grows the file so a repeat is observable even when two
 * writes share a filesystem timestamp.
 */
async function rewriteUntil(
  path: string, source: string, test: () => boolean, message: string, timeout = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeout
  for (let attempt = 0; !test(); attempt += 1) {
    if (Date.now() >= deadline) throw new Error(message)
    writeFileSync(path, `${source}${'\n'.repeat(attempt)}`)
    const settle = Date.now() + 500
    while (!test() && Date.now() < settle) await new Promise(resolve => setTimeout(resolve, 20))
  }
}

/** Poll `test` until it holds, or fail with `message`. */
async function eventually(test: () => boolean, message: string, timeout = 15_000): Promise<void> {
  const deadline = Date.now() + timeout
  while (!test()) {
    if (Date.now() >= deadline) throw new Error(message)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

/** Source of a fixture plugin that publishes `value` as the `hmrProbe` service. */
function probePlugin(value: string): string {
  return [
    'export const name = "probe"',
    'export function apply(ctx) {',
    `  ctx.provide("hmrProbe", ${JSON.stringify(value)})`,
    '}',
    '',
  ].join('\n')
}

/** The probe value a fixture plugin publishes, or undefined when it is not mounted. */
const probe = (ctx: Context, name = 'hmrProbe'): unknown => ctx.get(name)

describe('vendored cordis HMR module reload', () => {
  it('rebuilds a changed plugin exactly once', { timeout: 60_000 }, async () => {
    const dir = project()
    const plugin = join(dir, 'plugin.mjs')
    writeFileSync(plugin, probePlugin('initial'))
    const ctx = await boot(dir)
    try {
      await ctx.loader.create({ name: './plugin.mjs' })
      await eventually(() => probe(ctx) === 'initial', 'plugin never mounted')

      let reloads = 0
      ctx.on('hmr/reload', () => { reloads += 1 })
      await rewriteUntil(plugin, probePlugin('reloaded'), () => probe(ctx) === 'reloaded', 'plugin never reloaded')
      // One stale plugin, one rebuild: the reload stage runs per fiber, so a
      // second instance would leave the service registered twice.
      expect(reloads).toBe(1)
      expect(probe(ctx)).toBe('reloaded')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('leaves a plugin that fails to reload failed, and recovers it on the next change', { timeout: 60_000 }, async () => {
    const dir = project()
    const plugin = join(dir, 'plugin.mjs')
    writeFileSync(plugin, probePlugin('initial'))
    const ctx = await boot(dir)
    try {
      await ctx.loader.create({ name: './plugin.mjs' })
      await eventually(() => probe(ctx) === 'initial', 'plugin never mounted')

      await rewriteUntil(plugin, [
        'export const name = "probe"',
        'export function apply() { throw new Error("reload failure") }',
        '',
      ].join('\n'), () => probe(ctx) === undefined, 'failing plugin was never unloaded')

      // A failed rebuild is not rolled back; the next change to the same file
      // retries it, exactly as a cold start would.
      await rewriteUntil(plugin, probePlugin('recovered'), () => probe(ctx) === 'recovered', 'plugin never recovered')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('leaves the running plugin untouched when the changed module is not a plugin', { timeout: 60_000 }, async () => {
    const dir = project()
    const plugin = join(dir, 'plugin.mjs')
    writeFileSync(plugin, probePlugin('initial'))
    const ctx = await boot(dir)
    try {
      await ctx.loader.create({ name: './plugin.mjs' })
      await eventually(() => probe(ctx) === 'initial', 'plugin never mounted')

      // Plugin validity is decided while only the module cache has changed, so
      // a malformed export cannot unload the running instance first and then
      // fail to replace it.
      writeFileSync(plugin, 'export const name = "probe"\nexport const apply = 42\n')
      await new Promise(resolve => setTimeout(resolve, 500))
      expect(probe(ctx)).toBe('initial')

      await rewriteUntil(plugin, probePlugin('fixed'), () => probe(ctx) === 'fixed', 'plugin never reloaded after the export was fixed')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rebuilds a nested entry exactly once when its host tree reloads with it', { timeout: 60_000 }, async () => {
    const dir = localProject()
    const dep = join(dir, 'tree-dep.mjs')
    writeFileSync(dep, 'export const version = "v1"\n')
    // A minimal entry-tree host in the shape of the include plugin: its fiber
    // owns a subtree, so rebuilding it rebuilds every entry below it. The
    // subtree hangs off an extra plain fiber, so the nested entry's direct
    // parent is not itself reloaded and only an ancestor walk can see that the
    // nested entry is already being rebuilt from above.
    writeFileSync(join(dir, 'plugin-tree.mjs'), [
      'import { Service } from "@deepseek-ai/cordis"',
      'import { EntryGroup, EntryTree } from "@deepseek-ai/cordis-plugin-loader"',
      'import { version } from "./tree-dep.mjs"',
      'export const name = "plugin-tree"',
      'export default class Tree extends EntryTree {',
      '  static inject = ["loader"]',
      '  constructor(ctx, config) { super(ctx); this.config = config }',
      '  async* [Service.init]() {',
      '    const stats = (globalThis.__dshHmrTree ??= {})',
      '    stats.treeVersion = version',
      '    await this.ctx.plugin((ctx) => { this.group = new EntryGroup(ctx, this) })',
      '    yield () => this.group?.stop()',
      '    await this.group.update([{ id: "nested", name: "./plugin-nested.mjs" }])',
      '    // Stall so the next reload batch arrives while this fiber is still',
      '    // initializing: its unload, and with it the disposal of the fiber',
      '    // between it and the nested entry, is deferred until the stall ends.',
      '    await new Promise((resolve) => setTimeout(resolve, 300))',
      '  }',
      '  write() {}',
      '}',
      '',
    ].join('\n'))
    writeFileSync(join(dir, 'plugin-nested.mjs'), [
      'import { version } from "./tree-dep.mjs"',
      'export const name = "plugin-nested"',
      'export function apply() {',
      '  const stats = (globalThis.__dshHmrTree ??= {})',
      '  stats.applied = (stats.applied ?? 0) + 1',
      '  stats.nestedVersion = version',
      '}',
      '',
    ].join('\n'))

    const stats: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__dshHmrTree = stats
    const ctx = await boot(dir)
    try {
      await ctx.loader.create({ name: './plugin-tree.mjs' })
      await eventually(() => stats.applied === 1, 'nested entry never mounted')

      await rewriteUntil(dep, 'export const version = "v2"\n', () => stats.nestedVersion === 'v2', 'nested entry never reloaded')
      // Settle: a second instance would be registered right after the first.
      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(stats.treeVersion).toBe('v2')
      // The host tree rebuilds everything below it, so rebuilding the nested
      // entry as a stale plugin of its own would leave two instances.
      expect(stats.applied).toBe(2)
    } finally {
      await ctx.fiber.dispose()
      delete (globalThis as Record<string, unknown>).__dshHmrTree
    }
  })

  it('keeps config reloading when the loader internals are unreachable', { timeout: 60_000 }, async () => {
    const dir = project()
    const warnings: string[] = []
    const ctx = await boot(dir, { internals: false, warnings })
    const config = join(dir, 'patch.yml')
    writeFileSync(config, 'value: initial\n')
    let refreshes = 0
    try {
      await ctx.hmr.registerConfig(config, () => { refreshes += 1 })
      const initial = refreshes
      writeFileSync(config, 'value: changed\n')

      // Module reloading is what the internals provide; a config watch is
      // plain filesystem work and must keep running without them.
      await eventually(() => refreshes > initial, 'config change was never observed')
    } finally {
      await ctx.fiber.dispose()
    }
    expect(warnings.filter(warning => warning.includes('module reloading is disabled'))).toHaveLength(1)
  })
})
