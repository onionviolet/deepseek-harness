# Agent Note: Resync vendored Cordis onto upstream head

Status: implemented

English | [中文](2026-09-05-resync-vendored-cordis-head.zh.md)

## Problem

The [previous resync](2026-08-24-resync-vendored-cordis.md) left `vendor/cordis/src` at `8cc9e33fab69` and every other vendored Cordis package at a mirror commit no longer reachable. Upstream then shipped twelve `src` commits across core, loader, include, timer and hmr: four correctness fixes in the fiber and event bus, a new service-resolution rule, the loader's runtime-shape detection of Node's internal module loader, and a rewrite of HMR's partial reload. Two of them matter beyond tidiness. `cordiverse/cordis#51` keys listener buckets by symbol and stops an unregistered event name reaching `Object.prototype`; `cordiverse/cordis#44` makes a waterfall continuation single-shot, which is the dispatch mode the agent loop, the tool pipeline and the LLM stream all wrap.

The loader fix is the harness's own: upstream ported it from a deepseek-harness commit that never landed here, so the repository shipped the defect it had already diagnosed — a loader tagged from the Node major version, which mistags every 24.0–24.11.1 runtime as the v2 shape and calls `resolveSync` with reversed parameters.

## Decision

Cherry-pick eleven of the twelve upstream `src` commits onto the vendored tree in upstream order, each as a three-way merge (upstream at the commit's parent as base, the vendored file as ours, the commit as theirs), and bump every Cordis row of the manifest to `303cfd21e41a`. The twelfth is deferred and logged as a local modification, so the manifest still reads as "upstream at this commit plus the logged modifications".

The manifest's Upstream repo column now names `cordiverse/cordis` for all seven Cordis packages. Five of them pointed at a `deepseek-harness/cordis` mirror that no longer resolves, and every commit carried across came from the upstream repository, so the column records where the code can actually be found.

`4cfd19ad` is the deferred one. It resolves a service access against the def site — the service whose code performs the access — rather than the context the value was reached through. The harness reaches services through objects a service handed out (`agent.ctx.systemPrompt`, an `Agent` recovered from `ctx.agents`) and identifies a caller context by a property the Typert gateway put on it; under the new rule those reads resolve against the providing service's injects, and the gateway's identity callback stops seeing the context the caller extended. The gateway, apiproxy, goal and pi-ai suites fail against it. Adopting it is a redesign of how caller identity crosses the Typert client and of every `x.ctx.<service>` read — a decision to take on its own, not inside a vendor sync — so `reflect.ts` and `utils.ts` keep the previous resolution as local modification 21.

Two carried changes meet a local modification head-on:

`10194de3d` stops a failed fiber re-entering its lifecycle when an injected service reloads — a plugin body that threw is not made correct by an unrelated dependency change. Local modification 15 resolves entry config lazily, so a failure can also come from evaluating a `!!js` expression against the services the current epoch names. The fiber now records which of the two failed: a body failure keeps upstream's rule, and a config-resolution failure re-enters on the next epoch change, because that epoch is the input the expression is evaluated against. Without the split, a row whose expression read a briefly misconfigured provider stays failed until the process restarts, and no user edit can recover it.

`1c1a10e` widens `internal/dispatch`'s event name to `string | symbol`. The two harness invariant companions that read every dispatch (`dsh-scope`, `dsh-workflow`) return early for a symbol name: harness event maps are string-keyed, so no symbol event is a scoped or workflow event.

The vendored HMR service returns to upstream's `@Inject('loader')` / `@Inject('timer')` decorators. An earlier change had replaced them with `static inject` without logging the divergence; the decorators compile and behave identically here, so the unlogged divergence is removed rather than legitimized.

Each carried fix is pinned by a test that fails against the pre-fix source, in `packages/boot/app-boot/tests/`: `cordis-events.spec.ts` (symbol and prototype-named events, single-shot waterfall continuations), `cordis-failure.spec.ts` (a failed fiber does not re-enter, `update()` reports failure without an unhandled rejection), `cordis-timer.spec.ts` (concurrent interval reads), `loader-shape.compat.spec.ts` (loader shape detection), and `hmr-reload.spec.ts` (module reload, a failed rebuild left failed, HMR without loader internals). The lazy-config exception to upstream's failed-fiber rule is pinned by the provider-replacement case in `user-patches.spec.ts`, which fails against the unadapted upstream guard.

`cordis-failure.spec.ts` registers plugins that fail on purpose, so it is listed in `scripts/test-invariants.ts` as a manual-topology suite: joining a deliberate failure to the shared invariant startup barrier fails every other root plugin in the run.

## Alternatives considered

- **Copy upstream `src/` over and re-apply the log** — rejected for the same reason as last time: modifications 6, 8, 12 and 15 rewrote `fiber.ts`, `events.ts`, `entry.ts` and the HMR watcher past the point where the log reads as a patch series. Per-commit merges keep one behavior per commit and let each carried fix be pinned by a test.
- **Take the core fixes and leave HMR at the old partial reload** — rejected. The rewrite is what makes a nested entry tree reloadable: without it a stale plugin under a host that is itself being rebuilt is registered twice, and a malformed export unloads the running instance before failing to replace it. Both paths are reachable from an ordinary `dsh` edit-and-save.
- **Keep upstream's failed-fiber rule unmodified** — rejected: it strands any row whose lazy config expression failed once, which the harness's own patch-overlay flow produces whenever a provider is temporarily misconfigured. Dropping local modification 15 instead was not considered a live option; the deferred resolution is what makes `!!js` expressions see injected services at all.
- **Carry `4cfd19ad` and adapt the harness call sites** — rejected for this change: the reads it breaks are not a handful of test conveniences but the Typert gateway's caller-identity mechanism and the `x.ctx.<service>` pattern across four packages. Reworking those under a vendor sync would bury a product decision inside a framework bump. Logged as local modification 21 so the next sync starts from a stated position rather than rediscovering the conflict.
- **Keep `static inject` in HMR and log it** — rejected: a divergence needs a reason, and there is none. Upstream's decorators pass the same tests.
- **Renumber the local-modification log after upstream adopted entry 13** — rejected: implemented Agent Notes cite entries by number. Entry 13 is marked retired in place and the numbering stays stable.

## Consequences

- Numeric behavior changes reach plugin authors: a waterfall listener may take `next()` exactly once (a second call throws), and `Fiber.update()` returns an awaitable whose rejection is pre-handled, so dropping the result no longer risks an unhandled rejection while awaiting it still observes the failure. `docs/cordis-primer.md` states the continuation rule.
- Symbol-keyed events are dispatchable, and an event named after an `Object.prototype` property no longer resolves to that method. No harness event uses either form today; the invariant companions skip symbol names explicitly rather than by luck.
- HMR now starts without Node loader internals, warning once that module reloading is off while config reloading keeps working. A sandbox or runtime where `node-addon-require-builtin` cannot load degrades instead of failing boot.
- `packages/boot/app-boot/tests/` gains five vendored-framework suites. The HMR nested-entry case writes its fixture modules inside the package's `tests/` directory, because a fixture in the system temp directory cannot resolve workspace packages.
- The vendored core is one upstream commit behind in behavior while the manifest names the head. Local modification 21 is the record; the cost is that a reader comparing `reflect.ts` and `utils.ts` against `303cfd21e41a` sees a difference the log has to explain.
- The upstream ancestor-skip path in HMR's reload stage is covered forward but not falsifiable here: the nested-entry case passes against the pre-fix source as well, because the harness's Loader and Include modifications settle the batch in a different order than upstream's fixtures do. The other HMR cases fail without their fixes.

## Related

Four open upstream pull requests re-implement behavior this repository already carries as a local modification — `#116` (patching rows inserted by an earlier patch, modification 11), `#47` (serialized include writes, modification 14), `#96` and `#91` (registration and effect drain during unload, modification 6). When one merges, the corresponding log entry retires the way entry 13 just did.

Three further open pull requests are ported rather than waited on, in [their own note](../bug-fix/2026-09-05-port-open-cordis-fixes.md): `#56` (fiber-scoped `internal/update` listeners never expired), `#55` (an uncontained `internal/status` observer) and `#104` (an opaque failure for a plugin `Config` that is not a Standard Schema).
