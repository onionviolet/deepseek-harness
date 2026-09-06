import { describe, expect, it, vi } from 'vitest'
import { Context, FiberState, Service } from '@deepseek-ai/cordis'

// Regression home for vendored-cordis fiber and dispatch behavior, beside the
// logger regressions and for the same reason (vendor/ has no test lane of its
// own). `ctx.plugin()` hands back a WRAPPED fiber; these cases pin that
// lifecycle writes land on the canonical fiber behind that wrapper, which is
// what makes the harness's own local modifications to `update()` observable.

describe('vendored cordis wrapped-fiber lifecycle', () => {
  it('restarts through the wrapper without shadowing canonical state', async () => {
    const root = new Context()
    const apply = vi.fn()
    const fiber = root.plugin(apply)

    await fiber
    await fiber.restart()

    expect(apply).toHaveBeenCalledTimes(2)
    expect(fiber.state).toBe(FiberState.ACTIVE)
    expect(Object.hasOwn(fiber, 'state')).toBe(false)
    expect(Object.hasOwn(fiber, 'inertia')).toBe(false)
  })

  it('updates through the wrapper without shadowing canonical config', async () => {
    const applied: Array<[number, string]> = []

    class Provider extends Service {
      value: number
      constructor(ctx: Context, config: { value: number }) {
        super(ctx, 'provider')
        this.value = config.value
      }
    }

    const Consumer = {
      inject: ['provider'],
      apply(ctx: Context, config: { mode: string }) {
        applied.push([(ctx as Context & { provider: Provider }).provider.value, config.mode])
      },
    }

    const root = new Context()
    const provider = root.plugin(Provider, { value: 1 })
    const consumer = root.plugin(Consumer, { mode: 'old' })
    await provider
    await consumer

    void provider.update({ value: 2 })
    void consumer.update({ mode: 'new' })
    await Promise.all([provider.await(), consumer.await()])

    const canonical = Object.getPrototypeOf(consumer) as typeof consumer
    // The consumer re-applied against the RELOADED provider: config resolution
    // is deferred until the fiber can activate (vendor/README.md local
    // modification 15), and the resolved config lands on the canonical fiber.
    expect(applied).toEqual([[1, 'old'], [2, 'new']])
    expect(consumer.state).toBe(FiberState.ACTIVE)
    expect(consumer.config).toBe(canonical.config)
    expect(consumer.state).toBe(canonical.state)
    expect(Object.hasOwn(consumer, 'config')).toBe(false)
    expect(Object.hasOwn(consumer, 'state')).toBe(false)
    expect(Object.hasOwn(consumer, 'inertia')).toBe(false)
  })
})

describe('vendored cordis generations', () => {
  it('discards a suspended load that a newer update superseded', async () => {
    const root = new Context()
    const releases: (() => void)[] = []
    const marks: number[] = []
    let applied = 0
    const fiber = root.plugin(async (ctx: Context) => {
      applied += 1
      const generation = applied
      await new Promise<void>(resolve => releases.push(resolve))
      ctx.effect(() => {
        marks.push(generation)
        return () => { marks.push(-generation) }
      })
    })
    await new Promise(resolve => setTimeout(resolve))
    expect(applied).toBe(1)

    // The update takes the fiber to INACTIVE and straight back, so the
    // suspended first attempt wakes to the epoch value it captured. Only the
    // generation separates it from the attempt that owns the fiber now.
    void fiber.update({})
    await new Promise(resolve => setTimeout(resolve))
    for (const release of releases.splice(0)) release()
    await new Promise(resolve => setTimeout(resolve))
    for (const release of releases.splice(0)) release()
    await fiber.await()

    // The superseded attempt's effect is unwound rather than kept, and the
    // update's own generation runs: without this the update is silently lost.
    expect(applied).toBe(2)
    expect(marks).toEqual([1, -1, 2])
    expect(fiber.state).toBe(FiberState.ACTIVE)
  })
})

describe('vendored cordis unload ordering', () => {
  it('keeps a provider\'s resources alive until its consumers have unloaded', async () => {
    const root = new Context()
    const events: string[] = []
    let released = false

    const provider = root.plugin((ctx: Context) => {
      ctx.provide('probeResource', { use: () => events.push(released ? 'use-after-release' : 'use-ok') })
      ctx.effect(() => () => { released = true; events.push('resource-released') })
    })
    await provider

    const consumer = root.inject(['probeResource'], (ctx: Context) => {
      ctx.effect(() => async () => {
        events.push('consumer-cleanup-start')
        await new Promise(resolve => setTimeout(resolve, 30))
        ;(ctx as Context & { probeResource: { use: () => void } }).probeResource.use()
        events.push('consumer-cleanup-end')
      })
    })
    await consumer

    await provider.dispose()

    // The provider relinquishes the service and waits for the consumer's own
    // teardown before dropping what that teardown was still using.
    expect(events).toEqual(['consumer-cleanup-start', 'use-ok', 'consumer-cleanup-end', 'resource-released'])
  })

  it('aborts the fiber signal before any disposer runs', async () => {
    const root = new Context()
    const order: string[] = []
    let seenAtSignal: string[] | undefined

    const fiber = root.plugin((ctx: Context) => {
      ctx.fiber.signal.addEventListener('abort', () => {
        seenAtSignal = [...order]
        order.push('signal')
      }, { once: true })
      ctx.effect(() => () => { order.push('disposer') })
    })
    await fiber

    await fiber.dispose()

    // Cancellation cannot wait for teardown ordering: work in flight learns
    // its owner is going away before the first disposer runs.
    expect(seenAtSignal).toEqual([])
    expect(order).toEqual(['signal', 'disposer'])
  })
})

describe('vendored cordis dispatch', () => {
  it('applies listeners with the dispatch this-argument', () => {
    const root = new Context()
    const seen: unknown[] = []
    root.on('internal/status' as never, function (this: unknown) {
      seen.push(this)
    } as never)

    const fiber = root.plugin(() => {})

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(value => value !== undefined)).toBe(true)
    void fiber
  })

  it('runs waterfall listeners outermost-first, with the dispatch this, and lets one veto the rest', () => {
    const root = new Context()
    const order: string[] = []
    const thisArg = { tag: 'dispatch-this' }
    const seenThis: unknown[] = []
    root.on('probe/waterfall' as never, (function (this: unknown, next: () => unknown) {
      seenThis.push(this)
      order.push('outer')
      return next()
    }) as never, { global: true })
    root.on('probe/waterfall' as never, (function (this: unknown) {
      seenThis.push(this)
      order.push('veto')
      return 'vetoed'
    }) as never, { global: true })

    const result: unknown = root.events.waterfall(thisArg, 'probe/waterfall', () => {
      order.push('inner')
      return 'inner'
    })

    expect(order).toEqual(['outer', 'veto'])
    expect(result).toBe('vetoed')
    expect(seenThis).toEqual([thisArg, thisArg])
  })

  it('reaches an internal/dispatch listener for a non-internal event', () => {
    const root = new Context()
    const seen: string[] = []
    root.on('internal/dispatch' as never, ((type: string, name: string) => {
      seen.push(`${type}:${name}`)
    }) as never, { global: true })

    ;(root.emit as unknown as (name: string) => void)('probe/event')

    expect(seen).toContain('emit:probe/event')
  })
})
