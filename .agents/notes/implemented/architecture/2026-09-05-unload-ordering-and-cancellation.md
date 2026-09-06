# Agent Note: Order teardown, announce cancellation

Status: implemented

English | [中文](2026-09-05-unload-ordering-and-cancellation.zh.md)

## Problem

A provider fiber released the resources its own services hand out while consumers were still using them. `Fiber._unload()` disposed every effect in one `Promise.all`, so nothing ordered a service's teardown against the teardown of fibers still consuming it: a consumer's asynchronous cleanup could call into a service whose socket, sandbox or process the provider had already closed. Upstream's [cordiverse/cordis#110](https://github.com/cordiverse/cordis/pull/110) has been open for weeks against the same defect ([issue 26](https://github.com/cordiverse/cordis/issues/26)).

The [first attempt to port it](../bug-fix/2026-09-05-port-open-cordis-fixes.md) failed. Upstream splits a fiber's disposer list into three ordered phases — child fibers, then this fiber's services, then everything else — and that serialization broke nine harness tests across five packages, every one of them a disposal-during-setup path. The cause was not the grouping: a reduced two-phase variant broke the same set. Two facts came out of that attempt and shape this design:

- The harness signals in-flight work by *disposing an effect*: a factory's `accepting` flag, an E2B service's `disposed` flag, a terminal service's setup aborts all flip inside a disposer. Any ordering that delays a fiber's disposers therefore delays cancellation, and setup that should have been abandoned runs to completion instead.
- Upstream's own mechanism does not reach its goal here. Instrumenting the provide disposer showed `tracked 0 pending 0`: by the time a provider releases its services, `notify()` has already dropped its consumers from the impl, so the disposer has nobody to await.

## Decision

Separate the two things a disposer was being asked to express — *cancellation*, which must be immediate, and *teardown*, which must be ordered.

`Fiber.signal` is an `AbortSignal` that aborts the moment a fiber starts unloading, before any disposer runs. A reload installs a fresh signal, so anything holding the previous one sees it aborted. This is the public way to learn that an owner is going away.

`_unload()` then orders only what has to be ordered. The fiber releases its own services first — the `ctx.provide()` disposer deletes the store entry, notifies, and awaits the consumer fibers tracked on the `Impl` — and drains everything else concurrently afterwards. Child fibers and ordinary effects keep the concurrent single-pass drain that local modification 6 depends on; only the provider's own resources move behind its consumers. `_releasing` keeps a consumer that is itself releasing services from deadlocking the wait, as upstream's version does.

Consumer tracking comes from `#110`: an `Impl` carries the set of fibers currently injecting it, maintained by `_setImpl()`, because `notify()` alone cannot see a consumer that is already unloading.

Three harness services move their announcement onto the signal and keep their teardown in effects: the agent loop's `FactoryOwnership` (stop accepting, abort the teardown signal, wake `waitWhileActive`), `dsh-e2b` (`disposed`), and `dsh-subprocess-e2b` (`disposing` plus aborting terminal setups in flight). `docs/defensive-patterns.md` states the rule for the next service.

## Consequences

- A consumer's cleanup can use a service it injected: the provider's resources outlive it. `packages/boot/app-boot/tests/cordis-fiber.spec.ts` pins the ordering, and pins that the signal fires before the first disposer; both fail against the pre-redesign source.
- Two agent-loop expectations changed, and their tests changed with them. A factory unload during scope minting now skips the caller's `setup` callback entirely rather than running it and rolling back — which is what that test's own name always claimed. A synchronous `agentLoop.create()` racing factory teardown now throws `agent loop is not active` instead of returning an agent that is torn down a moment later.
- Cancellation is no longer coupled to teardown ordering, so a future ordering change cannot silently delay it again. The cost is a second mechanism to know about: a service author who reaches for a disposer to flip a flag is now wrong, and only the documented pattern says so.
- Upstream's `symbols.plugin` marker is not carried: nothing orders child-fiber disposal here, so the marker would have no reader.
- This tree and upstream now solve issue 26 differently. If `#110` merges as written, the next sync re-applies this modification rather than taking it, and the log entry says so.

## Alternatives considered

- **Port `#110` as written** — rejected with evidence, above: nine failing tests, and the mechanism does not reach its own goal in this tree.
- **Mark the effects that must run late** (`ctx.effect(execute, label, { afterConsumers: true })`) — rejected: it puts the burden on every provider author to classify each effect, and forgetting is silent. Ordering a provider's whole drain behind its consumers needs no annotation and is right by default.
- **Mark the effects that must run early (cancellation)** — rejected for the same reason, inverted: 38 `ctx.effect(() => () => …)` sites would need auditing, and a missed one silently delays cancellation. The signal is separate from the effect system, so there is nothing to forget.
- **Keep cancellation in disposers and accept late delivery** — rejected: the harness's disposal-during-setup contracts exist because half-built agents, terminals and language servers leak when setup outlives its owner.
- **Let consumers keep working against a released service** (fix the call sites instead) — rejected: it moves an ownership problem into every consumer's cleanup path, and the consumer cannot tell a released service from a live one.
