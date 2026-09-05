import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'

// Regression home for vendored-cordis event-bus behavior, beside the fiber and
// logger regressions and for the same reason (vendor/ has no test lane of its
// own). These cases pin the two upstream dispatch fixes the harness carries:
// listener buckets keyed by symbol or by an `Object.prototype` property name,
// and waterfall continuations that may be taken exactly once.

describe('vendored cordis event names', () => {
  it('dispatches a symbol-named event through every mode and forgets it on disposal', async () => {
    const root = new Context()
    const event = Symbol('probe')
    const seen: number[] = []
    const dispose = root.on(event, (value: number) => {
      seen.push(value)
      return value
    })

    root.emit(event, 1)
    expect(root.bail(event, 2)).toBe(2)
    expect(await root.serial(event, 3)).toBe(3)
    await root.parallel(event, 4)
    expect(seen).toEqual([1, 2, 3, 4])

    dispose()
    root.emit(event, 5)
    expect(seen).toEqual([1, 2, 3, 4])
  })

  it('treats prototype property names as ordinary events', () => {
    const root = new Context()

    // An unregistered name must not reach `Object.prototype` and dispatch its method.
    expect(() => { (root.emit as unknown as (name: string) => void)('toString') }).not.toThrow()

    for (const name of ['__proto__', 'toString', 'constructor']) {
      const callback = vi.fn()
      const dispose = root.on(name as never, callback as never)

      ;(root.emit as unknown as (event: string) => void)(name)
      expect(callback, name).toHaveBeenCalledTimes(1)

      dispose()
      ;(root.emit as unknown as (event: string) => void)(name)
      expect(callback, name).toHaveBeenCalledTimes(1)
      expect(Reflect.has(root.events._hooks, name), name).toBe(false)
    }
  })

  it('drops a listener bucket once its last listener is disposed', () => {
    const root = new Context()
    const event = Symbol('temporary')
    const first = root.on(event, () => {})
    const second = root.on(event, () => {})

    first()
    expect(Reflect.has(root.events._hooks, event)).toBe(true)
    second()
    expect(Reflect.has(root.events._hooks, event)).toBe(false)
  })
})

describe('vendored cordis waterfall continuations', () => {
  it('rejects a continuation taken twice from one listener', () => {
    const root = new Context()
    const inner = vi.fn(() => 'inner')
    const listener = vi.fn((next: () => unknown): unknown => {
      next()
      return next()
    })
    root.on('probe/waterfall' as never, listener as never, { global: true })

    expect(() => { root.events.waterfall('probe/waterfall', inner) }).toThrow('next() called multiple times')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('rejects a continuation captured by an outer listener and taken from an inner frame', () => {
    const root = new Context()
    const order: string[] = []
    let outerNext!: () => unknown
    root.on('probe/waterfall' as never, ((next: () => unknown): unknown => {
      outerNext = next
      order.push('outer')
      return next()
    }) as never, { global: true })
    root.on('probe/waterfall' as never, ((next: () => unknown): unknown => {
      order.push('inner-listener')
      return next()
    }) as never, { global: true })

    expect(() => {
      root.events.waterfall('probe/waterfall', (): unknown => {
        order.push('terminal')
        return outerNext()
      })
    }).toThrow('next() called multiple times')
    expect(order).toEqual(['outer', 'inner-listener', 'terminal'])
  })

  it('rejects a continuation taken again after it resolved', async () => {
    const root = new Context()
    const inner = vi.fn(() => Promise.resolve('inner'))
    let second: unknown
    root.on('probe/async-waterfall' as never, (async (next: () => Promise<string>) => {
      const result = await next()
      second = () => next()
      return result
    }) as never, { global: true })

    expect(await root.events.waterfall('probe/async-waterfall', inner)).toBe('inner')
    expect(second).toBeTypeOf('function')
    expect(second as () => unknown).toThrow('next() called multiple times')
    expect(inner).toHaveBeenCalledTimes(1)
  })
})

describe('vendored cordis update hooks', () => {
  it('drops a fiber-scoped internal/update listener with the generation that registered it', async () => {
    const root = new Context()
    const seen: number[] = []
    const fiber = root.plugin((ctx: Context) => {
      ctx.on('internal/update', (config: { n: number }, _noSave: boolean, next: () => void | Promise<void>) => {
        seen.push(config.n)
        return next()
      })
    }, { n: 0 } as never)
    await fiber

    for (const n of [1, 2, 3]) {
      void fiber.update({ n })
      await fiber.await()
    }

    // The Fiber instance survives a reload, so a listener the previous
    // generation registered would still be in the list and run again.
    expect(seen).toEqual([1, 2, 3])
  })

  it('honours an explicit disposer for the current generation', async () => {
    const root = new Context()
    const seen: number[] = []
    let dispose!: () => void
    const fiber = root.plugin((ctx: Context) => {
      dispose = ctx.on('internal/update', (config: { n: number }, _noSave: boolean, next: () => void | Promise<void>) => {
        seen.push(config.n)
        return next()
      })
    }, { n: 0 } as never)
    await fiber

    dispose()
    void fiber.update({ n: 1 })
    await fiber.await()

    expect(seen).toEqual([])
  })
})
