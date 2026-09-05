# Agent Note: Read the vendor manifest back with a status command

Status: implemented

English | [中文](2026-09-05-vendor-upstream-status.zh.md)

## Problem

The manifest in `vendor/README.md` records which upstream repository and commit every vendored directory was taken from, and nothing ever read it back. Drift was discovered when someone thought to look, so it accumulated: by the [resync onto upstream head](2026-09-05-resync-vendored-cordis-head.md) the Cordis rows were twelve `src` commits behind, and one of those commits was a fix upstream had ported *from* this repository — the harness shipped a defect it had already diagnosed because nobody compared the two sides.

Two of the recorded upstreams cannot be reached at all. The `cosmokit/` and `schemastery/` rows name `deepseek-harness` mirrors that no longer resolve, and the commits they record exist in no reachable repository: `shigma/cosmokit` and `shigma/schemastery` are live but do not contain those SHAs. Nobody noticed, because nothing tried.

## Decision

`pnpm run vendor:status` parses the manifest table and asks each upstream repository, through the GitHub REST API, which commits since the recorded one touch that package's `src` prefix. It prints one line per row — up to date, n commits behind with their subjects, or a comparison failure — and `--check` exits non-zero when any row is behind, which is the shape a scheduled job wants.

The tool reports drift; it does not gate a commit. Vendored drift is not caused by the change under review, and a network call cannot sit in `hygiene` or a pre-commit hook. Making it a command that a maintainer or a scheduled run invokes keeps the offline gates offline.

The source prefix, not the package directory, decides relevance: an upstream README or test change is not drift for a vendored copy that ships `src` only. Manifest parsing, prefix derivation, commit filtering and report rendering are pure functions over an injected comparison fetcher, so `scripts/vendor-upstream-status.spec.ts` covers them without a network, and one case parses the manifest this repository actually ships — a table-format change fails that case rather than silently reporting zero rows.

The unreachable `cosmokit/` and `schemastery/` provenance is recorded in `vendor/README.md` as a stated gap rather than repaired by guessing: repointing those rows at `shigma/*` would name repositories that do not contain the recorded commits, which is a worse claim than the one being fixed. Whoever next syncs either package re-derives the provenance by comparing the vendored source against a reachable upstream, then repoints the row.

## Alternatives considered

- **A nightly CI job that diffs vendored sources against upstream checkouts** — the [supply-chain proposal](../../proposed/process/2026-06-11-supply-chain-and-vendor-drift.md) still owns that; it needs a checked-in patch file per local modification to distinguish expected divergence from new drift. This command answers the cheaper question ("what has upstream done since?") with no new artifacts to maintain, and it is the question the last two syncs actually needed answered.
- **Add it to `hygiene` or the pre-commit hook** — rejected: it needs the network, its answer does not depend on the change under review, and a rate-limited API call in a commit hook trades a real gate for an intermittent one.
- **Compare file contents rather than commit lists** — rejected here: the vendored files carry twenty-four logged local modifications, so a content diff is mostly expected divergence and needs the patch-file machinery above to be readable. A commit list is directly actionable: each entry is a candidate to cherry-pick or dismiss.
- **Repoint the `cosmokit`/`schemastery` rows at `shigma/*`** — rejected: those repositories do not contain the recorded commits, so the row would claim a provenance that cannot be checked out. An unreachable mirror that the tool reports every run is the honest state.

## Consequences

- `pnpm run vendor:status` is the first thing the sync procedure tells you to run, so a sync starts from the list of upstream commits rather than from a diff someone assembled by hand.
- The command exits non-zero today, because the two unverifiable rows are reported as comparison failures. That is deliberate: their provenance is genuinely broken, and a green run would hide it. A scheduled `--check` job therefore needs those rows repaired before it is worth wiring up.
- The GitHub API is called without a token unless `GITHUB_TOKEN` or `GH_TOKEN` is set. Nine rows fit inside the unauthenticated rate limit; a repository far behind reports at most the first 100 commits of the range, which is enough to decide to sync.
