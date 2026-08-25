# Agent Note: Resync vendored Cordis onto upstream 4.0.0-rc.8

Status: implemented

English | [中文](2026-08-24-resync-vendored-cordis.zh.md)

## Problem

The vendored Cordis core sat at `56b3d4f7` while upstream shipped six correctness and performance fixes to `packages/core/src`. Four of them touch files that carry heavy local modifications — the fiber lifecycle hardening, the transactional Loader/Include reconciliation, and the lazy Loader config resolution — so the documented sync procedure ("copy `src/` over, re-apply the local modifications") cannot run as one mechanical pass. Left unsynced, the harness keeps upstream defects it has no reason to own: an exporter disposer that deletes the wrong sink, and inverted `info`/`warn` severities that make a level threshold keep the less severe tier.

## Decision

Cherry-pick the upstream `src` commits onto the vendored tree in dependency order rather than copying `src/` wholesale, and record the partial state in the manifest while it lasts.

`vendor/README.md` gains an **In-flight upstream sync** section listing each upstream commit applied ahead of the manifest's Commit column. The column keeps naming the snapshot every file is fully at, so it never claims a sync that did not happen; the section is deleted and the column bumped when the last commit lands. Entries in that section are upstream code and do not enter the local-modification log, which stays a record of divergence from upstream.

Regression coverage lives in `packages/boot/app-boot/tests/`. `vendor/` is outside the coverage lane's `include` and outside vitest's test globs, so it has no test directory of its own; app-boot already owns the composed cordis tree and hosts the Loader and HMR regressions the local modifications require, which makes it the one home for framework behavior a future resync must not silently drop.

Each fix is pinned by a test that fails against the pre-fix source. That check is the point of the cherry-pick order: an upstream fix re-applied by hand onto locally modified code is not verified by the fact that it compiles.

The `events.ts` and `fiber.ts` re-application runs as a real three-way merge — upstream at the manifest SHA as the base, the vendored file as ours, upstream's head as theirs — rather than by reading the two diffs side by side. The local modifications are large enough that an upstream hunk landing in untouched code is easy to miss by eye, and the merge reports exactly the regions where an upstream change and a local one overlap. Both files produced one conflict, each in a region a local modification owns.

The one behavior upstream deprecates and the harness still needs stays supported locally: `events.dispatch()` returns the resolved listener set, and ten harness call sites drive listeners themselves so a single throw or rejection cannot starve the rest. Upstream's `emit()` still runs listeners in one uncontained loop, so there is nothing to migrate to; local modification 19 drops the tag and records upstream's intent.

## Alternatives considered

- **Copy upstream `src/` over and re-apply the local-modification log** — rejected, and it is the procedure `vendor/README.md` documents. Local modifications 6, 8, 12, and 15 rewrote `fiber.ts` and `events.ts` past the point where the log reads as a re-appliable patch series; a wholesale copy makes the reviewer diff the union of six upstream fixes against four local rewrites in one change, with no commit at which a single behavior can be pinned.
- **Take only the two logger fixes and stop** — rejected: it leaves the wrapped-fiber `restart()` defect and the callable-service shadow gap in a framework layer whose lifecycle semantics the agent loop's correctness depends on, and it strands the manifest at a SHA no file is at.
- **Bump the manifest Commit column immediately and note the exceptions** — rejected: the column's meaning is "upstream at this SHA plus the logged modifications", and a reader reconstructing the vendored tree from a bumped column would produce code we do not ship. The in-flight list inverts that risk: it over-reports work remaining rather than under-reporting divergence.
- **Drop the vendored logger for a maintained logging dependency** — rejected here: `ctx.logger` is a Cordis service woven into fiber identity and intercept resolution, so replacing it is a framework decision, not a sync.

## Consequences

- The manifest is truthful at every commit in the sequence, at the cost of a section that must be deleted when the column is bumped. A stale in-flight list is visible (it names commits) where a stale Commit column is not.
- `packages/boot/app-boot/tests/` is now the home for vendored-framework regressions as well as boot glue. That ownership is stated in the test files rather than implied, because the package's README describes boot helpers and nothing there predicts logger coverage.
- The wrapped-fiber fix closes a silent config-loss path, not only a tidiness one: before it, `update()` on a fiber whose injected service was reloading at the same moment applied the *previous* config and reported success. The regression test pins that pair of updates specifically.
- `events.dispatch()` stays undeprecated locally, so the ten call sites keep compiling without suppressions and the migration stays a decision rather than a lint deadline. The cost is that upstream's signal lives only in the JSDoc and the modification log.
- Numeric log levels in configuration change meaning: `levels: { default: 1 }` selected `info` and now selects `warn`. The only such value in the repository is `default: 3` (debug), whose meaning is unchanged, and no published on-disk format carries a level.
