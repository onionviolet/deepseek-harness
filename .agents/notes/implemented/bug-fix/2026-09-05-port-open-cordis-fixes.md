# Agent Note: Port three open upstream Cordis fixes

Status: implemented

English | [中文](2026-09-05-port-open-cordis-fixes.zh.md)

## Problem

Three defects in the vendored Cordis fiber survived the [resync onto upstream head](../process/2026-09-05-resync-vendored-cordis-head.md), because upstream has not merged their fixes: all three live in open pull requests, and all three are reachable from ordinary harness operation.

A non-global `ctx.on('internal/update')` never became a fiber effect. The registration is intercepted before the ordinary listener path and pushed onto `fiber._hooks`, and the value returned to the caller was the list entry's disposer — nothing removed the entry when the fiber unloaded. A Fiber instance survives a reload, so every generation left its closure registered: three config updates dispatched six listener invocations, and the count grows with each reload. The Loader's own `internal/update` handling rides that chain, so an entry's config update re-ran every previous generation's handler.

`_updateState()` emitted `internal/status` through `emit()`, which runs listeners in one uncontained loop — from inside a lifecycle transition. A throwing diagnostic observer was therefore caught by the Fiber constructor and written into `_error`: `await plugin` rejected for a plugin that had applied cleanly, and when the plugin had genuinely failed the observer's error replaced it, so `FAILED` named the wrong cause. Local modification 6 had already contained the sibling `internal/plugin` notification for exactly this reason; `internal/status` was left uncontained.

`resolveConfig()` assumed every truthy plugin `Config` exposes `~standard.validate`. A plugin is whatever an imported module exported, so a `Config` that is not a Standard Schema — a plain object, a Zod schema from a mismatched major, a value the author meant as a default — failed inside the validator with `Cannot read properties of undefined (reading 'validate')`, naming neither the plugin nor the contract it missed.

## Decision

Port [cordiverse/cordis#56](https://github.com/cordiverse/cordis/pull/56), [cordiverse/cordis#55](https://github.com/cordiverse/cordis/pull/55) and [cordiverse/cordis#104](https://github.com/cordiverse/cordis/pull/104) into the vendored tree as local modifications 22, 23 and 24, so the next sync re-applies or retires them explicitly.

The update-hook registration becomes `fiber.effect(() => hooks[method](listener), 'ctx.on("internal/update")')`. The entry is owned by the generation that added it and disappears with that generation's unload, while an explicit disposer still works within the generation.

`internal/status` and `internal/plugin` now share one `emitContained()` helper: it resolves the listener set itself, invokes each listener in its own `try`, and logs both synchronous throws and rejected returns. Upstream writes a second free function for status alone; the harness already had the containment loop for plugin teardown, so the two notifications are one helper and two thin callers rather than two copies of the same loop.

Observers of these two events own neither fiber state nor the fiber's error. That is the invariant the containment expresses: a diagnostic that fails is a failed diagnostic, not a failed plugin.

`resolveConfig()` checks that `Config['~standard'].validate` is callable and throws `plugin Config must implement Standard Schema V1` when it is not. This is validation at a module boundary, not defensive typing of a same-process interface: the value crossed into the process from a file the Loader imported.

## Alternatives considered

- **Wait for upstream to merge both PRs** — rejected: the update-hook leak grows with every reload, and `dsh` reloads on every config edit. The log entries carry the upstream links, so a future sync that finds them merged retires the entries instead of re-applying them.
- **Contain `internal/status` with a second free function, as upstream does** — rejected: the harness already contains `internal/plugin` with the same loop. Two copies of one containment rule invite them to drift; the shared helper is the extraction the duplication was asking for.
- **Clear `fiber._hooks` in `_unload()` instead of registering an effect** — rejected: it would drop listeners the *current* generation registered during unload, and it re-implements ownership the effect system already provides. The effect also gives the registration a label in fiber diagnostics.
- **Also port the stale-generation fix ([#54](https://github.com/cordiverse/cordis/pull/54))** — deferred: it redesigns the epoch into a desired-state snapshot plus a generation serial, in the file carrying the heaviest local modifications, and no harness-reachable reproduction was found (a restored provider takes a fresh `uid`, so the epoch string does not repeat). It stays on the candidate list with `#110` (provider teardown ordered against consumers) and `#66` (circular inject detection).

## Consequences

- A plugin that registers `internal/update` and then reloads no longer re-runs its previous generations' handlers. Any harness code that relied on the accumulation — none found — would see one invocation per update instead of n.
- A throwing `internal/status` observer is now a logged error and nothing more. Diagnostics, the web UI's fiber view and any future status telemetry cannot fail the tree they observe.
- `emitContained()` is the single containment point for lifecycle notifications, so a third such event gets the behavior by construction.
- A plugin whose `Config` is not a Standard Schema now fails registration with a message naming the contract, before `apply()` runs.
- Covered by `packages/boot/app-boot/tests/cordis-events.spec.ts` (hooks expire with the generation, explicit disposal still works) and `cordis-failure.spec.ts` (a healthy plugin stays ACTIVE, a failed one keeps its own error, an invalid `Config` is named). Four of the five cases fail against the pre-port source.
