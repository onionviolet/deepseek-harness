# Agent Note: Read the vendor manifest back with a status command

Status: implemented

English | [中文](2026-09-05-vendor-upstream-status.zh.md)

## Problem

The manifest in `vendor/README.md` records which upstream repository and commit every vendored directory was taken from, and nothing ever read it back. Drift was discovered when someone thought to look, so it accumulated: by the [resync onto upstream head](2026-09-05-resync-vendored-cordis-head.md) the Cordis rows were twelve `src` commits behind, and one of those commits was a fix upstream had ported *from* this repository — the harness shipped a defect it had already diagnosed because nobody compared the two sides.

Two of the recorded upstreams could not be reached at all. The `cosmokit/` and `schemastery/` rows named `deepseek-harness` mirrors that no longer resolve, and the commits they recorded exist in no reachable repository: `shigma/cosmokit` and `shigma/schemastery` are live but do not contain those SHAs. Nobody noticed, because nothing tried.

## Decision

`pnpm run vendor:status` parses the manifest table and asks each upstream repository, through the GitHub REST API, which commits since the recorded one touch that package's `src` prefix. It prints one line per row — up to date, n commits behind with their subjects, or a comparison failure — and `--check` exits non-zero when any row is behind, which is the shape a scheduled job wants.

The tool reports drift; it does not gate a commit. Vendored drift is not caused by the change under review, and a network call cannot sit in `hygiene` or a pre-commit hook. Making it a command that a maintainer or a scheduled run invokes keeps the offline gates offline. `.github/workflows/vendor-drift.yml` runs `--check` weekly, on Mondays: an upstream that moved yesterday does not need answering today, and a per-push job would report the same answer every run until someone acted on it, which is how a signal gets ignored.

The source prefix, not the package directory, decides relevance: an upstream README or test change is not drift for a vendored copy that ships `src` only. Manifest parsing, prefix derivation, commit filtering and report rendering are pure functions over an injected comparison fetcher, so `scripts/vendor-upstream-status.spec.ts` covers them without a network, and one case parses the manifest this repository actually ships — a table-format change fails that case rather than silently reporting zero rows.

The tool's first run found the two unreachable rows, and they are repaired by content rather than by guessing a release tag. `vendor/cosmokit/src` is byte-identical to `shigma/cosmokit@02e691c5aa7f` once the logged `.ts`-specifier and JSDoc modifications are applied, and `vendor/schemastery/src/index.ts` matches `shigma/schemastery@cf0b7e5481d0` (`packages/core`) apart from the two lines modification 10 owns — the `type Dict` import and the ESM default export. Both rows now name a repository that resolves and a commit that contains the source the vendored copy actually carries, and `vendor/README.md` records that re-derivation method for the next time an upstream disappears.

## Alternatives considered

- **A nightly CI job that diffs vendored sources against upstream checkouts** — the [supply-chain proposal](../../proposed/process/2026-06-11-supply-chain-and-vendor-drift.md) still owns that; it needs a checked-in patch file per local modification to distinguish expected divergence from new drift. This command answers the cheaper question ("what has upstream done since?") with no new artifacts to maintain, and it is the question the last two syncs actually needed answered.
- **Add it to `hygiene` or the pre-commit hook** — rejected: it needs the network, its answer does not depend on the change under review, and a rate-limited API call in a commit hook trades a real gate for an intermittent one.
- **Compare file contents rather than commit lists** — rejected here: the vendored files carry twenty-four logged local modifications, so a content diff is mostly expected divergence and needs the patch-file machinery above to be readable. A commit list is directly actionable: each entry is a candidate to cherry-pick or dismiss.
- **Repoint the `cosmokit`/`schemastery` rows at the `shigma/*` release tag matching the Version column** — rejected: the tag is a guess about which snapshot the mirror held. Comparing the vendored source against candidate commits costs one diff and produces a commit the row can claim, which is what shipped. Leaving the rows pointed at the vanished mirrors was rejected for the same reason the tool exists: an unverifiable provenance that nothing checks is how this drifted in the first place.

## Consequences

- `pnpm run vendor:status` is the first thing the sync procedure tells you to run, so a sync starts from the list of upstream commits rather than from a diff someone assembled by hand.
- All nine rows now resolve and report up to date, so the command exits zero and the weekly job is green on arrival. A row that stops resolving is a comparison failure, which fails `--check` the same way being behind does.
- A red weekly run is a TODO, not a broken build: it means upstream moved, and the fix is the sync procedure, not a revert. Nothing else depends on that job, so it cannot block a release.
- The GitHub API is called without a token unless `GITHUB_TOKEN` or `GH_TOKEN` is set. Nine rows fit inside the unauthenticated rate limit; a repository far behind reports at most the first 100 commits of the range, which is enough to decide to sync.
