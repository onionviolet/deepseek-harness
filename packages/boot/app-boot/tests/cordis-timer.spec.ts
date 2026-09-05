import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Timer from '@deepseek-ai/cordis-plugin-timer'

// Regression home for the vendored timer plugin, beside the other
// vendored-framework cases (vendor/ has no test lane of its own). `ctx.interval()`
// hands out an async iterator whose reads may be in flight concurrently; each
// read owns one tick, and settling the iterator settles every pending read.

const withTimer = async (): Promise<Context> => {
  const root = new Context()
  await root.plugin(Timer)
  return root
}

describe('vendored cordis interval iterator', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('settles concurrent reads one tick at a time, in request order', async () => {
    const ctx = await withTimer()
    const iterator = ctx.interval(1000)
    const settled: string[] = []
    const first = iterator.next().then(() => settled.push('first'))
    const second = iterator.next().then(() => settled.push('second'))

    await vi.advanceTimersByTimeAsync(1000)
    expect(settled).toEqual(['first'])

    await vi.advanceTimersByTimeAsync(1000)
    expect(settled).toEqual(['first', 'second'])
    await Promise.all([first, second])
  })

  it('resolves every pending read when the iterator returns', async () => {
    const ctx = await withTimer()
    const iterator = ctx.interval<number>(1000)
    const reads = [iterator.next(), iterator.next(), iterator.next()]

    await expect(iterator.return!(42)).resolves.toEqual({ done: true, value: 42 })
    expect(await Promise.all(reads)).toEqual([
      { done: true, value: 42 },
      { done: true, value: 42 },
      { done: true, value: 42 },
    ])
  })

  it('rejects every pending read when the iterator throws', async () => {
    const ctx = await withTimer()
    const iterator = ctx.interval(1000)
    const reads = [iterator.next(), iterator.next(), iterator.next()]
    const reason = new Error('interval rejected')

    await expect(iterator.throw!(reason)).resolves.toEqual({ done: true, value: undefined })
    await Promise.all(reads.map(read => expect(read).rejects.toBe(reason)))
    await expect(iterator.next()).rejects.toBe(reason)
  })
})
