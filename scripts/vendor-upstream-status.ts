/**
 * Report how far each vendored package has fallen behind its upstream.
 *
 * The manifest in `vendor/README.md` records the upstream repository and commit
 * every vendored directory was taken from, but nothing reads it back: drift is
 * discovered when someone thinks to look, and the last time nobody did, twelve
 * upstream `src` commits accumulated — including a fix upstream had ported FROM
 * this repository. This walks the manifest and asks each upstream repository
 * which commits since the recorded one touch the vendored package's `src`.
 *
 * Run: `pnpm run vendor:status` to print the report, `--check` to exit non-zero
 * when any row is behind (the shape a scheduled job wants). Reads the GitHub
 * REST API, authenticating with `GITHUB_TOKEN` or `GH_TOKEN` when set — the
 * unauthenticated rate limit is enough for one pass over nine rows.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

/** One manifest row: a vendored directory and the upstream snapshot it was taken from. */
export interface VendorRow {
  /** Vendored directory under `vendor/`, without the trailing slash. */
  readonly directory: string
  /** Upstream repository as `owner/name`. */
  readonly repository: string
  /** Path of the package inside the upstream repository, `''` when it is the repository root. */
  readonly packagePath: string
  /** Commit the vendored copy was taken at. */
  readonly commit: string
}

/** One upstream commit reported for a vendored row. */
export interface UpstreamCommit {
  /** Abbreviated commit hash. */
  readonly sha: string
  /** First line of the commit message. */
  readonly subject: string
}

/** The comparison between a manifest row's commit and its upstream default branch. */
export interface CompareResult {
  /** Commits on the default branch that are not in the recorded snapshot. */
  readonly commits: readonly { sha: string; subject: string; files: readonly string[] }[]
}

/** Fetch the upstream comparison for one row; injected so the report logic stays offline-testable. */
export type CompareFetcher = (row: VendorRow) => Promise<CompareResult>

/** A row's status: the upstream commits that touch its vendored source. */
export interface RowStatus {
  readonly row: VendorRow
  /** Commits ahead of the recorded snapshot that touch the package's `src`. */
  readonly behind: readonly UpstreamCommit[]
  /** Why the row could not be compared, when it could not be. */
  readonly error?: string
}

const MANIFEST_ROW = /^\| `(?<directory>[^`]+)\/` \| `[^`]+` \| `[^`]+` \| [^|]+ \| (?<repo>[^|]+) \| `(?<commit>[0-9a-f]{7,40})` \|$/

/**
 * Parse the manifest table out of `vendor/README.md`.
 *
 * The Upstream repo cell is a bare GitHub URL, optionally followed by the
 * package path in backticks: `https://github.com/owner/name (\`packages/core\`)`.
 * @param markdown - the manifest file's contents.
 * @returns one row per vendored package, in manifest order.
 * @throws when a table row names a repository the format cannot express.
 */
export function parseVendorManifest(markdown: string): VendorRow[] {
  const rows: VendorRow[] = []
  for (const line of markdown.split('\n')) {
    const match = MANIFEST_ROW.exec(line.trim())
    // Every named group is mandatory in the pattern, so a match has all three.
    const { directory = '', repo = '', commit = '' } = match?.groups ?? {}
    if (!directory) continue
    const url = /https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<name>[\w.-]+)/.exec(repo)
    const { owner, name } = url?.groups ?? {}
    if (!owner || !name) {
      throw new Error(`vendor manifest row for ${directory} names no GitHub repository: ${repo.trim()}`)
    }
    const path = /\(`([^`]+)`\)/.exec(repo)
    rows.push({ directory, repository: `${owner}/${name}`, packagePath: path?.[1] ?? '', commit })
  }
  if (!rows.length) throw new Error('vendor manifest has no rows — has the table format changed?')
  return rows
}

/** The repository-relative prefix whose changes reach the vendored copy. */
export function sourcePrefix(row: VendorRow): string {
  return row.packagePath ? `${row.packagePath}/src/` : 'src/'
}

/**
 * Reduce one comparison to the commits that touch the row's vendored source.
 * @param row - the manifest row being compared.
 * @param result - the upstream comparison for that row.
 * @returns the commits ahead that change files under the row's `src`.
 */
export function commitsTouchingSource(row: VendorRow, result: CompareResult): UpstreamCommit[] {
  const prefix = sourcePrefix(row)
  return result.commits
    .filter(commit => commit.files.some(file => file.startsWith(prefix)))
    .map(({ sha, subject }) => ({ sha: sha.slice(0, 7), subject }))
}

/**
 * Compare every manifest row against its upstream.
 * @param rows - the parsed manifest rows.
 * @param fetch - fetches one row's upstream comparison.
 * @returns one status per row, in manifest order; a row whose comparison failed carries the reason.
 */
export async function collectStatus(rows: readonly VendorRow[], fetch: CompareFetcher): Promise<RowStatus[]> {
  const statuses: RowStatus[] = []
  for (const row of rows) {
    try {
      statuses.push({ row, behind: commitsTouchingSource(row, await fetch(row)) })
    } catch (error) {
      statuses.push({ row, behind: [], error: error instanceof Error ? error.message : String(error) })
    }
  }
  return statuses
}

/**
 * Render the report a human reads.
 * @param statuses - the collected row statuses.
 * @returns the report lines, without a trailing newline.
 */
export function formatReport(statuses: readonly RowStatus[]): string[] {
  const lines: string[] = []
  for (const { row, behind, error } of statuses) {
    if (error) {
      lines.push(`${row.directory}: comparison failed — ${error}`)
      continue
    }
    if (!behind.length) {
      lines.push(`${row.directory}: up to date with ${row.repository} at ${row.commit.slice(0, 7)}`)
      continue
    }
    lines.push(`${row.directory}: ${behind.length} upstream commit(s) touch ${sourcePrefix(row)} since ${row.commit.slice(0, 7)}`)
    for (const commit of behind) lines.push(`  ${commit.sha} ${commit.subject}`)
  }
  return lines
}

/** Fetch one row's comparison from the GitHub REST API. */
async function fetchCompare(row: VendorRow): Promise<CompareResult> {
  const token = process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN']
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  }
  if (token) headers['authorization'] = `Bearer ${token}`

  const repo = await fetch(`https://api.github.com/repos/${row.repository}`, { headers })
  if (!repo.ok) throw new Error(`GET /repos/${row.repository} returned ${repo.status}`)
  const { default_branch: branch } = await repo.json() as { default_branch: string }

  // The compare endpoint pages at 250 commits; a vendored package that far
  // behind is reported as "at least this many", which is enough to act on.
  const compare = await fetch(
    `https://api.github.com/repos/${row.repository}/compare/${row.commit}...${branch}?per_page=100`,
    { headers },
  )
  if (!compare.ok) throw new Error(`GET compare ${row.commit}...${branch} returned ${compare.status}`)
  const body = await compare.json() as {
    commits: { sha: string; commit: { message: string } }[]
    files?: { filename: string }[]
  }

  // The compare payload lists files for the whole range, not per commit, so ask
  // each commit for its own files; the ranges this reports are short by design.
  const commits: CompareResult['commits'] = await Promise.all(body.commits.map(async (entry) => {
    const detail = await fetch(`https://api.github.com/repos/${row.repository}/commits/${entry.sha}`, { headers })
    if (!detail.ok) throw new Error(`GET commit ${entry.sha.slice(0, 7)} returned ${detail.status}`)
    const { files = [] } = await detail.json() as { files?: { filename: string }[] }
    return {
      sha: entry.sha,
      subject: entry.commit.message.split('\n')[0] ?? '',
      files: files.map(file => file.filename),
    }
  }))
  return { commits }
}

/** Read the manifest, compare every row, print the report, and exit. */
async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const rows = parseVendorManifest(readFileSync(resolve(root, 'vendor/README.md'), 'utf8'))
  const statuses = await collectStatus(rows, fetchCompare)
  for (const line of formatReport(statuses)) process.stdout.write(`${line}\n`)

  const failed = statuses.filter(status => status.error)
  const behind = statuses.filter(status => status.behind.length)
  if (failed.length) {
    process.stdout.write(`vendor-upstream-status: ${failed.length} row(s) could not be compared\n`)
    process.exitCode = 1
    return
  }
  if (!behind.length) {
    process.stdout.write(`vendor-upstream-status: all ${statuses.length} vendored package(s) are at their recorded upstream\n`)
    return
  }
  process.stdout.write(
    `vendor-upstream-status: ${behind.length} of ${statuses.length} vendored package(s) are behind`
    + ' — see the sync procedure in vendor/README.md\n',
  )
  if (check) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
