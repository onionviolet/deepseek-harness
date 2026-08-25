import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Message } from '@deepseek-ai/cordis'

// Regression home for vendored-cordis logger behavior the harness relies on
// and a resync must not silently drop (vendor/README.md manifest). vendor/ is
// outside the coverage lane and has no test directory of its own; app-boot
// owns the composed cordis tree, so the framework regressions live beside the
// loader ones already here.

const collect = (ctx: Context, levels: Record<string, number>): Message[] => {
  const seen: Message[] = []
  ctx.logger.exporter({ levels, export: message => void seen.push(message) })
  return seen
}

describe('vendored cordis logger severities', () => {
  it('orders warn above info so a threshold keeps the more severe tier', () => {
    const ctx = new Context()
    // `1` is WARN: the exporter asked for errors and warnings only.
    const seen = collect(ctx, { default: 1 })
    const logger = ctx.logger('probe')

    logger.error('e')
    logger.warn('w')
    logger.info('i')
    logger.debug('d')

    expect(seen.map(message => message.type)).toEqual(['error', 'warn'])
  })

  it('exports every tier at the debug threshold', () => {
    const ctx = new Context()
    const seen = collect(ctx, { default: 3 })
    const logger = ctx.logger('probe')

    logger.error('e')
    logger.warn('w')
    logger.info('i')
    logger.debug('d')

    expect(seen.map(message => message.type)).toEqual(['error', 'warn', 'info', 'debug'])
  })
})

describe('vendored cordis logger exporter disposal', () => {
  it('disposes the exporter it registered, not the most recent one', async () => {
    const ctx = new Context()
    const first: Message[] = []
    const second: Message[] = []
    const disposeFirst = ctx.logger.exporter({ levels: { default: 3 }, export: message => void first.push(message) })
    ctx.logger.exporter({ levels: { default: 3 }, export: message => void second.push(message) })

    await disposeFirst()
    ctx.logger('probe').info('after')

    expect(first).toHaveLength(0)
    expect(second.map(message => String(message.args[0]))).toEqual(['after'])
  })
})
