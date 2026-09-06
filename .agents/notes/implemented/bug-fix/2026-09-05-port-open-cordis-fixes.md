# Agent Note: Port five open upstream Cordis fixes

Status: implemented

English | [中文](2026-09-05-port-open-cordis-fixes.zh.md)

## Problem

Five defects in the vendored Cordis fiber survived the [resync onto upstream head](../process/2026-09-05-resync-vendored-cordis-head.md), because upstream has not merged their fixes: all five live in open pull requests, and all five are reachable from ordinary harness operation.

A non-global `ctx.on('internal/update')` never became a fiber effect. The registration is intercepted before the ordinary listener path and pushed onto `fiber._hooks`, and the value returned to the caller was the list entry's disposer — nothing removed the entry when the fiber unloaded. A Fiber instance survives a reload, so every generation left its closure registered: three config updates dispatched six listener invocations, and the count grows with each reload. The Loader's own `internal/update` handling rides that chain, so an entry's config update re-ran every previous generation's handler.

`_updateState()` emitted `internal/status` through `emit()`, which runs listeners in one uncontained loop — from inside a lifecycle transition. A throwing diagnostic observer was therefore caught by the Fiber constructor and written into `_error`: `await plugin` rejected for a plugin that had applied cleanly, and when the plugin had genuinely failed the observer's error replaced it, so `FAILED` named the wrong cause. Local modification 6 had already contained the sibling `internal/plugin` notification for exactly this reason; `internal/status` was left uncontained.

A fiber identified its in-flight work by its dependency epoch, which is the *desired* state rather than the identity of the attempt. An `A → B → A` sequence therefore hands a suspended attempt back the value it captured, and it commits as if it still owned the fiber. `Fiber.update()` takes exactly that path when the plugin body is still running: the update drives the fiber to INACTIVE and straight back, the suspended first attempt wakes to its own epoch, keeps its effects, and reports ACTIVE — while the update's own generation never runs and its config change is lost without a diagnostic.

Plugins that inject each other never activate. Each fiber sits in PENDING waiting for a service the other will provide, nothing reports the cycle, and a hot reload can introduce one after the working version has already been unloaded.

`resolveConfig()` assumed every truthy plugin `Config` exposes `~standard.validate`. A plugin is whatever an imported module exported, so a `Config` that is not a Standard Schema — a plain object, a Zod schema from a mismatched major, a value the author meant as a default — failed inside the validator with `Cannot read properties of undefined (reading 'validate')`, naming neither the plugin nor the contract it missed.

## Decision

Port [cordiverse/cordis#56](https://github.com/cordiverse/cordis/pull/56), [#55](https://github.com/cordiverse/cordis/pull/55), [#104](https://github.com/cordiverse/cordis/pull/104), [#54](https://github.com/cordiverse/cordis/pull/54) and [#66](https://github.com/cordiverse/cordis/pull/66) into the vendored tree as local modifications 22 through 26, so the next sync re-applies or retires them explicitly.

The update-hook registration becomes `fiber.effect(() => hooks[method](listener), 'ctx.on("internal/update")')`. The entry is owned by the generation that added it and disappears with that generation's unload, while an explicit disposer still works within the generation.

`internal/status` and `internal/plugin` now share one `emitContained()` helper: it resolves the listener set itself, invokes each listener in its own `try`, and logs both synchronous throws and rejected returns. Upstream writes a second free function for status alone; the harness already had the containment loop for plugin teardown, so the two notifications are one helper and two thin callers rather than two copies of the same loop.

Observers of these two events own neither fiber state nor the fiber's error. That is the invariant the containment expresses: a diagnostic that fails is a failed diagnostic, not a failed plugin.

Every epoch change now also bumps a generation counter, and an attempt commits its effects, its failure and its state transition only while it still owns both epoch and generation. One deviation from upstream: a failure is still recorded once the fiber has been disposed, because no later attempt will run and a caller awaiting a setup that its own disposal aborted still has to see why it ended. `packages/lsp/lsp-stdio` and `packages/terminal/terminal` encode that contract, and upstream's unmodified rule breaks both.

`RegistryService` keeps a dependency graph of declared injects, declared `provide` names and runtime `ctx.provide()` calls. A registration that would close a cycle is rejected with the path spelled out (`circular plugin dependency: alpha -> beta -> alpha`) instead of parking two fibers in PENDING forever, a second provider for one service token is rejected, and a fiber that declared a service it never provided fails rather than loading. Entry-level `inject` merging moves from `internal/plugin` to the new `internal/plugin-meta` event, so the graph sees the loader's additions before the fiber exists.

`resolveConfig()` checks that `Config['~standard'].validate` is callable and throws `plugin Config must implement Standard Schema V1` when it is not. This is validation at a module boundary, not defensive typing of a same-process interface: the value crossed into the process from a file the Loader imported.

## Alternatives considered

- **Wait for upstream to merge both PRs** — rejected: the update-hook leak grows with every reload, and `dsh` reloads on every config edit. The log entries carry the upstream links, so a future sync that finds them merged retires the entries instead of re-applying them.
- **Contain `internal/status` with a second free function, as upstream does** — rejected: the harness already contains `internal/plugin` with the same loop. Two copies of one containment rule invite them to drift; the shared helper is the extraction the duplication was asking for.
- **Clear `fiber._hooks` in `_unload()` instead of registering an effect** — rejected: it would drop listeners the *current* generation registered during unload, and it re-implements ownership the effect system already provides. The effect also gives the registration a label in fiber diagnostics.
- **Port `#110` too (provider teardown ordered against consumers)** — attempted and rejected as written; the problem it targets is solved instead by [a redesigned unload ordering](../architecture/2026-09-05-unload-ordering-and-cancellation.md). It splits `_unload()`'s single concurrent drain into three ordered phases (child fibers, then this fiber's services, then everything else). That serialization contradicts the drain contract local modification 6 owns, and it broke eight tests across five packages — agent scope minting, terminal name reservation, LSP setup abortion, E2B terminal setup and session rollback — all of them disposal-during-setup paths where the harness asserts what a half-built child observes. A two-phase variant (services, then the rest) broke the same eight. The fix's own goal is not reached either: by the time a provider releases its services, `notify()` has already removed its consumers from the impl, so the disposer has nobody to await. Landing it means re-deriving those contracts under a new ordering, which is a lifecycle redesign, not a port.
- **Wait for `#54` and `#66` rather than porting them** — rejected once each had a reproduction: `#54`'s lost update is one `fiber.update()` on a plugin that is still loading, and `#66`'s hang is two plugins that inject each other, which a preset or a user's `cordis.yml` can express by accident.

## Consequences

- A plugin that registers `internal/update` and then reloads no longer re-runs its previous generations' handlers. Any harness code that relied on the accumulation — none found — would see one invocation per update instead of n.
- A throwing `internal/status` observer is now a logged error and nothing more. Diagnostics, the web UI's fiber view and any future status telemetry cannot fail the tree they observe.
- `emitContained()` is the single containment point for lifecycle notifications, so a third such event gets the behavior by construction.
- A plugin whose `Config` is not a Standard Schema now fails registration with a message naming the contract, before `apply()` runs.
- An update that lands while a plugin is still loading is applied by its own generation instead of being discarded by the attempt it superseded, and the superseded attempt's effects are unwound.
- `ctx.plugin()` can now throw `CircularDependencyError` where it previously returned a fiber that would never activate. Every registration pays a graph walk; at harness boot that is a few hundred nodes revisited per registration, far below the cost of loading the plugin itself.
- `#110` stays unported as written; the ordering problem it targets is closed by [the unload redesign](../architecture/2026-09-05-unload-ordering-and-cancellation.md), which the evidence above led to.
- Covered by `packages/boot/app-boot/tests/cordis-events.spec.ts` (hooks expire with the generation, explicit disposal still works) and `cordis-failure.spec.ts` (a healthy plugin stays ACTIVE, a failed one keeps its own error, an invalid `Config` is named). Four of the five cases fail against the pre-port source.
