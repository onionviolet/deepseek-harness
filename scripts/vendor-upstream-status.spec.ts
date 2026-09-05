/** Manifest parsing and drift reporting for the vendored-package status tool. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectStatus,
  commitsTouchingSource,
  formatReport,
  parseVendorManifest,
  sourcePrefix,
  type CompareResult,
  type VendorRow,
} from './vendor-upstream-status.ts'

const root = resolve(import.meta.dirname, '..')

const manifest = [
  '| Directory | npm name | Upstream name | Version | Upstream repo | Commit |',
  '|---|---|---|---|---|---|',
  '| `cosmokit/` | `@deepseek-ai/cosmokit` | `cosmokit` | 1.8.1 | https://github.com/owner/cosmokit | `16f6fc058ade66e8ac5da0033d35a8d0f279f544` |',
  '| `cordis/` | `@deepseek-ai/cordis` | `cordis` | 4.0.0-rc.9 | https://github.com/cordiverse/cordis (`packages/core`) | `303cfd21e41aa4168d83419efe4196c414cce3d2` |',
].join('\n')

const cordis: VendorRow = {
  directory: 'cordis',
  repository: 'cordiverse/cordis',
  packagePath: 'packages/core',
  commit: '303cfd21e41aa4168d83419efe4196c414cce3d2',
}

describe('vendor manifest parsing', () => {
  it('reads the repository, package path and commit of every row', () => {
    expect(parseVendorManifest(manifest)).toEqual([
      {
        directory: 'cosmokit',
        repository: 'owner/cosmokit',
        packagePath: '',
        commit: '16f6fc058ade66e8ac5da0033d35a8d0f279f544',
      },
      cordis,
    ])
  })

  it('rejects a row whose repository cell names no GitHub repository', () => {
    const broken = manifest.replace('https://github.com/owner/cosmokit', 'an internal mirror')
    expect(() => parseVendorManifest(broken)).toThrow('names no GitHub repository')
  })

  it('rejects a manifest with no table rows', () => {
    expect(() => parseVendorManifest('# Vendored Packages\n')).toThrow('no rows')
  })

  it('parses the manifest this repository ships', () => {
    const rows = parseVendorManifest(readFileSync(resolve(root, 'vendor/README.md'), 'utf8'))
    expect(rows.map(row => row.directory)).toContain('cordis')
    expect(rows.every(row => /^[\w.-]+\/[\w.-]+$/.test(row.repository))).toBe(true)
  })
})

describe('upstream source prefixes', () => {
  it('scopes a package inside a monorepo to its own source directory', () => {
    expect(sourcePrefix(cordis)).toBe('packages/core/src/')
  })

  it('scopes a repository-root package to its source directory', () => {
    expect(sourcePrefix({ ...cordis, packagePath: '' })).toBe('src/')
  })
})

describe('drift reporting', () => {
  const compared: CompareResult = {
    commits: [
      { sha: '1c1a10e0000', subject: 'fix(core): dispatch symbol events', files: ['packages/core/src/events.ts'] },
      { sha: 'b3df5580000', subject: 'chore: update README', files: ['README.md'] },
      { sha: '0027892000', subject: 'fix(hmr): nested trees', files: ['packages/hmr/src/index.ts'] },
    ],
  }

  it('keeps only the commits that reach the vendored source', () => {
    expect(commitsTouchingSource(cordis, compared)).toEqual([
      { sha: '1c1a10e', subject: 'fix(core): dispatch symbol events' },
    ])
  })

  it('reports a behind row with its commits, and an up-to-date row without', async () => {
    const statuses = await collectStatus([cordis, { ...cordis, directory: 'timer', packagePath: 'packages/timer' }],
      () => Promise.resolve(compared))
    expect(formatReport(statuses)).toEqual([
      'cordis: 1 upstream commit(s) touch packages/core/src/ since 303cfd2',
      '  1c1a10e fix(core): dispatch symbol events',
      'timer: up to date with cordiverse/cordis at 303cfd2',
    ])
  })

  it('keeps a failed comparison to its own row', async () => {
    const statuses = await collectStatus([cordis], () => Promise.reject(new Error('GET compare returned 404')))
    expect(statuses[0]?.error).toBe('GET compare returned 404')
    expect(formatReport(statuses)).toEqual(['cordis: comparison failed — GET compare returned 404'])
  })
})
