import { defineProperty } from '@deepseek-ai/cosmokit'
import type { Dict } from '@deepseek-ai/cosmokit'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { Context } from './context.ts'
import { Fiber } from './fiber.ts'
import { buildOuterStack, DisposableList, symbols, withProps } from './utils.ts'

function isApplicable(object: Plugin) {
  return object && typeof object === 'object' && typeof object.apply === 'function'
}

/**
 * Service dependency declaration accepted by plugins and the `@Inject`
 * decorator.
 *
 * Array form requests services without intercept config. Object form maps each
 * service name to optional intercept config for the plugin context.
 */
export type Inject<M = Dict> = (keyof M)[] | { [K in keyof M]?: M[K] }

/** Context keys that correspond to services with typed intercept config. */
export type InjectKey = keyof {
  [K in keyof Context & string as Context[K] extends { [symbols.config]: any } ? K : never]: any
}

/**
 * Decorator for declaring service dependencies on classes or class methods.
 *
 * On classes it contributes to the plugin's static `inject` map. On methods it
 * delays the method call until the declared services are available.
 */
/**
 * @param name — the required service name.
 * @param config — optional intercept config applied for that service.
 * @returns the class or method decorator.
 */
export function Inject<K extends InjectKey>(name: K, config?: Context[K] extends { [symbols.config]: infer T } ? T : never) {
  return function (value: any, decorator: ClassDecoratorContext<any> | ClassMethodDecoratorContext<any>) {
    if (decorator.kind === 'class') {
      if (!Object.hasOwn(value, 'inject')) {
        defineProperty(value, 'inject', Object.create(Object.getPrototypeOf(value).inject ?? null))
        defineProperty(value.inject, symbols.checkProto, true)
      }
      value.inject[name] = config
    } else if (decorator.kind === 'method') {
      const inject = (value[symbols.metadata] ??= {}).inject ??= Object.create(null)
      inject[name] = config
      decorator.addInitializer(function () {
        const property = this[symbols.tracker]?.property
        ;(this[symbols.initHooks] ??= []).push(() => {
          (this.ctx as Context).inject(inject, (ctx) => {
            return value.call(property ? withProps(this, { [property]: ctx }) : this)
          })
        })
      })
    } else {
      throw new Error('@Inject() can only be used on class or class methods')
    }
  }
}

/** Utilities for normalizing plugin dependency declarations. */
export namespace Inject {
  /**
   * Convert array/object/class-inherited inject metadata into a plain map.
   *
   * @param inject — the declaration to normalize; `null`/`undefined` add nothing.
   * @param result — the map to fill (service name → intercept config or `null`).
   * @returns `result`.
   */
  export function resolve(inject: Inject | null | undefined, result: Dict = Object.create(null)) {
    if (!inject) return result
    if (Array.isArray(inject)) {
      for (const name of inject) {
        result[name] = null
      }
    } else if (Reflect.has(inject, symbols.checkProto)) {
      Object.assign(result, resolve(Object.getPrototypeOf(inject)))
      for (const name of Object.keys(inject)) {
        result[name] = inject[name] ?? null
      }
    } else {
      for (const name of Object.keys(inject)) {
        result[name] = inject[name] ?? null
      }
    }
    return result
  }
}

/** Supported plugin entrypoint shapes. */
export type Plugin<T = any> =
  | Plugin.Function<T>
  | Plugin.Constructor<T>
  | Plugin.Object<T>

/** Types associated with plugin entrypoints and runtime records. */
export namespace Plugin {
  /** Shared metadata understood by the plugin registry and related tooling. */
  export interface Base<T = any> {
    /** Display name used for fiber diagnostics and logger names. */
    name?: string
    /** Standard-schema validator applied to config before the plugin starts. */
    Config?: StandardSchemaV1<any, T>
    /** Services the plugin requires; it only loads while all are available. */
    inject?: Inject
    /** Service name(s) every successful fiber of this plugin guarantees to provide. */
    provide?: string | string[]
    /** Service names whose intercept config the plugin declares it consumes. */
    intercept?: Dict<boolean>
  }

  export interface Transform<S, T> {
    /** Marks the transform object as a schema/config transform. */
    schema?: true
    /** Convert user-facing config to runtime config. */
    Config: (config: S) => T
  }

  /** Function plugin called with `(ctx, config)`. */
  export interface Function<T = any> extends Base<T> {
    (ctx: Context, config: T): any
  }

  /** Class plugin constructed with `(ctx, config)`. */
  export interface Constructor<T = any> extends Base<T> {
    new (ctx: Context, config: T): any
  }

  /** Object plugin with an `apply(ctx, config)` method. */
  export interface Object<T = any> extends Base<T> {
    apply(ctx: Context, config: T): any
  }

  /** Mutable registry record shared by all fibers of one plugin callback. */
  export interface Runtime {
    /** Display name copied from the first registered plugin shape. */
    name?: string
    /** Every live fiber of this plugin (one per `ctx.plugin()` call). */
    fibers: DisposableList<Fiber>
    /** The executable entrypoint all fibers share (registry identity key). */
    callback: globalThis.Function
    /** Standard-schema validator applied to each fiber's config. */
    Config?: StandardSchemaV1
  }

  /** Dependency declarations of one plugin, after loaders have extended them. */
  export interface Meta {
    /** Resolved service dependencies: service name → intercept config. */
    inject: Dict<any>
    /** Service names the plugin guarantees to provide once loaded. */
    provide: string[]
  }

  /** A plugin about to start, as the dependency graph sees it. */
  export interface Candidate {
    /** The executable entrypoint (registry identity key). */
    callback: globalThis.Function
    /** The context the plugin would load under. */
    parent: Context
    /** Dependency declarations, including loader additions. */
    meta: Meta
    /** The fiber this candidate replaces, when validating a reload. */
    replace?: Fiber
    /** Display name used in cycle and duplicate-provider diagnostics. */
    name: string
  }
}

declare module './events.ts' {
  export interface Events {
    'internal/plugin-meta'(meta: Plugin.Meta): void
  }
}

interface DependencyNode {
  id: object
  name: string
  parent: Context
  inject: string[]
  provide: string[]
}

interface ResolvedDependencyNode {
  id: object
  name: string
  inject: Map<symbol, string>
  provide: Map<symbol, string>
}

export class CircularDependencyError extends Error {
  name = 'CircularDependencyError'

  constructor(public cycle: string[]) {
    super(`circular plugin dependency: ${cycle.join(' -> ')}`)
  }
}

class DependencyGraph {
  private nodes = new Map<Fiber, DependencyNode>()
  private dynamic = new Map<Fiber, Set<{ ctx: Context, name: string }>>()

  constructor(private registry: RegistryService) {}

  private resolveToken(ctx: Context, name: string) {
    ctx.root[Context.isolate][name] ??= Symbol(name)
    return ctx[Context.isolate][name]
  }

  private createNode(candidate: Plugin.Candidate): DependencyNode {
    return {
      id: candidate,
      name: candidate.name,
      parent: candidate.parent,
      inject: Object.keys(candidate.meta.inject),
      provide: candidate.meta.provide,
    }
  }

  private resolveNode(node: DependencyNode): ResolvedDependencyNode {
    const inject = new Map<symbol, string>()
    const provide = new Map<symbol, string>()
    for (const name of node.inject) {
      inject.set(this.resolveToken(node.parent, name), name)
    }
    for (const name of node.provide) {
      provide.set(this.resolveToken(node.parent, name), name)
    }
    return { id: node.id, name: node.name, inject, provide }
  }

  private collectNodes(candidates: Plugin.Candidate[]) {
    const replacements = new Set(candidates.map(candidate => candidate.replace).filter(Boolean))
    const nodes = [...this.nodes]
      .filter(([fiber]) => !replacements.has(fiber))
      .map(([fiber, node]) => {
        const resolved = this.resolveNode(node)
        for (const entry of this.dynamic.get(fiber) ?? []) {
          resolved.provide.set(this.resolveToken(entry.ctx, entry.name), entry.name)
        }
        return resolved
      })
    for (const [fiber, dynamic] of this.dynamic) {
      if (this.nodes.has(fiber) || replacements.has(fiber)) continue
      const provide = new Map<symbol, string>()
      for (const entry of dynamic) {
        provide.set(this.resolveToken(entry.ctx, entry.name), entry.name)
      }
      nodes.push({
        id: fiber,
        name: fiber.name,
        inject: new Map(),
        provide,
      })
    }
    nodes.push(...candidates.map(candidate => this.resolveNode(this.createNode(candidate))))
    return nodes
  }

  validate(candidates: Plugin.Candidate[]) {
    const nodes = this.collectNodes(candidates)
    const providers = new Map<symbol, ResolvedDependencyNode>()
    for (const node of nodes) {
      for (const [token, name] of node.provide) {
        const oldNode = providers.get(token)
        if (oldNode && oldNode.id !== node.id) {
          throw new Error(`service "${name}" is provided by both <${oldNode.name}> and <${node.name}>`)
        }
        providers.set(token, node)
      }
    }

    const edges = new Map<ResolvedDependencyNode, ResolvedDependencyNode[]>()
    for (const node of nodes) {
      const targets: ResolvedDependencyNode[] = []
      for (const token of node.inject.keys()) {
        const target = providers.get(token)
        if (target) targets.push(target)
      }
      edges.set(node, targets)
    }

    const visited = new Set<ResolvedDependencyNode>()
    const visiting = new Map<ResolvedDependencyNode, number>()
    const stack: ResolvedDependencyNode[] = []
    const visit = (node: ResolvedDependencyNode): void => {
      if (visited.has(node)) return
      const index = visiting.get(node)
      if (index !== undefined) {
        throw new CircularDependencyError([...stack.slice(index), node].map(node => node.name))
      }
      visiting.set(node, stack.length)
      stack.push(node)
      for (const target of edges.get(node) ?? []) visit(target)
      stack.pop()
      visiting.delete(node)
      visited.add(node)
    }
    for (const node of nodes) visit(node)
  }

  add(fiber: Fiber, candidate: Plugin.Candidate) {
    const node = this.createNode(candidate)
    node.id = fiber
    this.nodes.set(fiber, node)
  }

  delete(fiber: Fiber) {
    this.nodes.delete(fiber)
    this.dynamic.delete(fiber)
  }

  provide(fiber: Fiber, ctx: Context, name: string) {
    const entry = { ctx, name }
    const dynamic = this.dynamic.get(fiber) ?? new Set<{ ctx: Context, name: string }>()
    dynamic.add(entry)
    this.dynamic.set(fiber, dynamic)
    try {
      this.validate([])
    } catch (error) {
      dynamic.delete(entry)
      if (!dynamic.size) this.dynamic.delete(fiber)
      throw error
    }
    return () => {
      dynamic.delete(entry)
      if (!dynamic.size) this.dynamic.delete(fiber)
    }
  }

  assertProvides(fiber: Fiber) {
    const node = this.nodes.get(fiber)
    if (!node) return
    for (const name of node.provide) {
      const token = this.resolveToken(node.parent, name)
      if (this.registry.ctx.reflect.store[token]?.fiber === fiber) continue
      throw new Error(`plugin <${node.name}> declared service "${name}" but did not provide it`)
    }
  }
}

type Spread<T> = undefined extends T ? [config?: T] : [config: T]

type GetPluginParameters<P> =
  | P extends (ctx: Context, ...args: infer R) => any
  ? R
  : P extends new (ctx: Context, ...args: infer R) => any
  ? R
  : P extends { apply(ctx: Context, ...args: infer R): any }
  ? R
  : never

type GetPluginConfig<P> =
  | P extends Plugin.Transform<infer S, any>
  ? S
  : GetPluginParameters<P>[0]

declare module './context.ts' {
  export interface Context {
    /**
     * Run a callback once the requested services are available.
     *
     * Shorthand for `ctx.plugin({ inject, apply: callback })`: the callback
     * is unloaded and re-run whenever a required service changes.
     *
     * @param deps — required services, as an array or a name → config map.
     * @param callback — plugin body called with `(ctx, config)`.
     * @returns the fiber; awaiting it settles once loading finished.
     */
    inject(deps: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>
    /**
     * Load a plugin in the current context.
     *
     * @param plugin — a function, class, or `{ apply }` object plugin.
     * @param args — the plugin config, validated against its `Config` schema.
     * @returns the fiber; awaiting it settles once loading finished
     * (rejecting on config or startup errors).
     */
    plugin<P extends Plugin>(plugin: P, ...args: Spread<GetPluginConfig<P>>): Fiber & PromiseLike<Fiber>
  }
}

/**
 * Plugin registry installed as `ctx.registry` and mixed into every context.
 *
 * It normalizes plugin shapes, tracks plugin runtimes, starts fibers, and
 * exposes map-like inspection over active plugin callbacks.
 */
export class RegistryService {
  private _counter = 0
  private _internal = new Map<Function, Plugin.Runtime>()
  private _graph = new DependencyGraph(this)

  constructor(public ctx: Context) {
    defineProperty(this, symbols.tracker, {
      property: 'ctx',
      noShadow: true,
    })
  }

  /** Allocate the next fiber uid (increments on every read). */
  get counter() {
    return ++this._counter
  }

  /** Number of registered plugin runtimes. */
  get size() {
    return this._internal.size
  }

  /**
   * Resolve a supported plugin shape to its executable callback.
   *
   * @param plugin — a function, class, or `{ apply }` object plugin.
   * @returns the callback identifying the plugin, or `undefined` if invalid.
   */
  resolve(plugin: Plugin): Function | undefined {
    // plugin.apply may throw
    try {
      if (typeof plugin === 'function') return plugin
      if (isApplicable(plugin)) return plugin.apply
    } catch {}
  }

  /**
   * Look up the runtime record for a plugin.
   *
   * @param plugin — any supported plugin shape.
   * @returns the runtime, or `undefined` when the plugin is not registered.
   */
  get(plugin: Plugin) {
    const key = this.resolve(plugin)
    return key && this._internal.get(key)
  }

  /**
   * Check whether a plugin has a registered runtime.
   *
   * @param plugin — any supported plugin shape.
   * @returns `true` when at least one fiber of the plugin exists.
   */
  has(plugin: Plugin) {
    const key = this.resolve(plugin)
    return !!key && this._internal.has(key)
  }

  /**
   * Dispose every running fiber for a plugin and remove its runtime record.
   *
   * @param plugin — any supported plugin shape.
   * @returns the removed runtime, or `undefined` when none was registered.
   */
  delete(plugin: Plugin) {
    const key = this.resolve(plugin)
    const runtime = key && this._internal.get(key)
    if (!runtime) return
    this._internal.delete(key)
    for (const fiber of runtime.fibers) {
      fiber.dispose()
    }
    return runtime
  }

  /** Iterate the registered plugin callbacks. */
  keys() {
    return this._internal.keys()
  }

  /** Iterate the registered plugin runtimes. */
  values() {
    return this._internal.values()
  }

  /** Iterate `[callback, runtime]` pairs. */
  entries() {
    return this._internal.entries()
  }

  /**
   * Visit every registered runtime.
   *
   * @param callback — receives each runtime and its identifying callback.
   */
  forEach(callback: (value: Plugin.Runtime, key: Function) => void) {
    return this._internal.forEach(callback)
  }

  /**
   * Start a callback once the requested dependencies are available.
   *
   * @param inject — required services, as an array or a name → config map.
   * @param callback — plugin body called with `(ctx, config)`.
   * @returns the fiber; awaiting it settles once loading finished.
   */
  inject(inject: Inject, callback: Plugin.Function<void>) {
    return this.plugin({ inject, apply: callback, name: callback.name })
  }

  /**
   * Resolve a plugin into a dependency-graph candidate without starting it.
   *
   * @param plugin — a function, class, or `{ apply }` object plugin.
   * @param replace — the fiber this candidate would replace, for validation.
   * @returns the candidate: callback, parent context, resolved meta, and name.
   * @throws when `plugin` is not a supported shape, or the current fiber is disposed.
   */
  prepare(plugin: Plugin, replace?: Fiber): Plugin.Candidate {
    const callback = this.resolve(plugin)
    if (!callback) throw new Error('invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin)
    this.ctx.fiber.assertActive()

    let name = plugin.name
    if (name === 'apply') name = undefined
    const provide = Array.isArray(plugin.provide)
      ? [...plugin.provide]
      : plugin.provide ? [plugin.provide] : []
    const meta: Plugin.Meta = {
      inject: Inject.resolve(plugin.inject),
      provide,
    }
    this.ctx.emit(this.ctx, 'internal/plugin-meta', meta)
    return {
      callback,
      parent: this.ctx,
      meta,
      replace,
      name: name || callback.name || 'anonymous',
    }
  }

  /**
   * Reject candidates that would close a dependency cycle or duplicate a provider.
   *
   * @param candidates — plugins about to start, alongside the live graph.
   * @throws {CircularDependencyError} when the candidates close an inject cycle.
   * @throws when two nodes would provide the same service token.
   */
  validate(candidates: Plugin.Candidate[]) {
    this._graph.validate(candidates)
  }

  /**
   * Assert a loaded fiber provided every service its plugin declared.
   *
   * @param fiber — the fiber whose plugin body has just returned.
   * @throws when a declared `provide` name has no implementation owned by this fiber.
   */
  assertProvides(fiber: Fiber) {
    this._graph.assertProvides(fiber)
  }

  /**
   * Drop a disposed fiber from the dependency graph.
   * @param fiber — the fiber being disposed.
   */
  _release(fiber: Fiber) {
    this._graph.delete(fiber)
  }

  /**
   * Record a service a fiber provides at runtime rather than by declaration.
   * @param fiber — the providing fiber.
   * @param name — the service name.
   * @returns a disposer that forgets the runtime provision.
   * @throws {CircularDependencyError} when the provision closes an inject cycle.
   */
  _provide(fiber: Fiber, name: string) {
    return this._graph.provide(fiber, this.ctx, name)
  }

  /**
   * Start a plugin in the current context and return its fiber.
   *
   * Creates (or reuses) the plugin's runtime record, then starts a new fiber
   * under the current context. Throws if `plugin` is not a supported shape,
   * if the current fiber is already disposed, or if the registration would
   * close a dependency cycle.
   *
   * @param plugin — a function, class, or `{ apply }` object plugin.
   * @param config — the plugin config, validated against its `Config` schema.
   * @param getOuterStack — captures the caller stack for effect diagnostics.
   * @returns the fiber; awaiting it settles once loading finished.
   */
  plugin(plugin: Plugin, config?: any, getOuterStack = buildOuterStack()) {
    const candidate = this.prepare(plugin)
    this.validate([candidate])
    const { callback } = candidate

    let runtime = this._internal.get(callback)
    if (!runtime) {
      const name = candidate.name === 'anonymous' ? undefined : candidate.name
      runtime = { name, callback, fibers: new DisposableList(), Config: plugin.Config }
      this._internal.set(callback, runtime)
    }

    const fiber = new Fiber(this.ctx, config, candidate.meta.inject, runtime, getOuterStack)
    this._graph.add(fiber, candidate)
    const wrapped = Object.create(fiber) as Fiber & PromiseLike<Fiber>
    wrapped.then = (onFulfilled, onRejected) => {
      return fiber.await().then(onFulfilled, onRejected)
    }
    return wrapped
  }
}
