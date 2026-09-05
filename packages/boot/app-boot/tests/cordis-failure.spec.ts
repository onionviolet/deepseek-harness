import { describe, expect, it, vi } from 'vitest'
import { Context, FiberState } from '@deepseek-ai/cordis'

// Regression home for vendored-cordis failure handling, split from
// cordis-fiber.spec.ts because these cases register plugins that fail on
// purpose: the shared invariant startup barrier in scripts/test-invariants.ts
// would join those failures into every other root plugin's startup, so this
// file is listed there as a manual-topology suite.

describe('vendored cordis failed fibers', () => {
  it('does not re-enter a plugin whose body failed when an injected service reloads', async () => {
    const root = new Context()
    vi.spyOn(root.logger, 'error').mockImplementation(() => {})
    let applied = 0
    const dispose = root.provide('probeService', 1)
    const fiber = root.inject(['probeService'], async () => {
      applied += 1
      throw new Error('boom')
    })
    await fiber.await().catch(() => {})

    expect(fiber.state).toBe(FiberState.FAILED)
    dispose()
    root.provide('probeService', 2)
    await new Promise(resolve => setTimeout(resolve))

    // Reloading the injected service is not a new attempt: the plugin body
    // failed on its own terms, so only update() clears that failure.
    expect(applied).toBe(1)
    expect(fiber.state).toBe(FiberState.FAILED)
  })

  it('recovers a failed fiber through update()', async () => {
    const root = new Context()
    vi.spyOn(root.logger, 'error').mockImplementation(() => {})
    let failing = true
    let applied = 0
    const fiber = root.plugin(async () => {
      applied += 1
      if (failing) throw new Error('boom')
    })
    await Promise.resolve(fiber).catch(() => {})
    expect(fiber.state).toBe(FiberState.FAILED)

    failing = false
    // A failed fiber has no ACTIVE state to resolve config against, so the
    // update defers the reload; awaiting the fiber observes its outcome.
    void fiber.update({})
    await fiber.await()

    expect(applied).toBe(2)
    expect(fiber.state).toBe(FiberState.ACTIVE)
  })

  it('reports an update failure to its caller without leaving an unhandled rejection', async () => {
    const root = new Context()
    vi.spyOn(root.logger, 'error').mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      let failing = false
      const observed = root.plugin(async () => {
        if (failing) throw new Error('boom')
      })
      const dropped = root.plugin(async () => {
        if (failing) throw new Error('boom')
      })
      await observed
      await dropped

      failing = true
      // A caller that awaits the update observes the failure...
      await expect(observed.update({})).rejects.toThrow('boom')
      // ...while a caller that drops the result cannot turn it into an
      // unhandled rejection.
      void dropped.update({})
      await new Promise(resolve => setTimeout(resolve))
      await new Promise(resolve => setTimeout(resolve))

      expect(dropped.state).toBe(FiberState.FAILED)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
