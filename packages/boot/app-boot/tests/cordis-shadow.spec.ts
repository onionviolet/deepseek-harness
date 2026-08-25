import { describe, expect, it } from 'vitest'
import { Context, Service, symbols } from '@deepseek-ai/cordis'
import type { Message } from '@deepseek-ai/cordis'

// Regression home for vendored-cordis caller identity, beside the logger and
// fiber cases (vendor/ has no test lane of its own). A service reads its
// CALLER through `symbols.caller`; the shadow on `this.ctx` stays the service's
// own origin. The harness depends on that split wherever a service attributes
// work to whoever asked for it — `ctx.logger` names every line this way.

const callerOf = (service: object): Context | undefined =>
  (service as Record<symbol, Context | undefined>)[symbols.caller]

const shadowOf = (ctx: Context): Context | undefined =>
  (ctx as unknown as Record<symbol, Context | undefined>)[symbols.shadow]

describe('vendored cordis caller identity', () => {
  it('exposes the caller while keeping the service shadow at its own origin', async () => {
    let innerOrigin!: Context
    let outerOrigin!: Context

    class Inner extends Service {
      constructor(ctx: Context) {
        super(ctx, 'inner')
        innerOrigin = ctx
      }

      inspect(): { caller: Context | undefined; shadow: Context | undefined } {
        return { caller: callerOf(this), shadow: shadowOf(this.ctx) }
      }
    }

    class Outer extends Service {
      static inject = ['inner']
      constructor(ctx: Context) {
        super(ctx, 'outer')
        outerOrigin = ctx
      }

      inspect(): { caller: Context | undefined; shadow: Context | undefined; outerShadow: Context | undefined } {
        const inner = (this.ctx as Context & { inner: Inner }).inner
        return { ...inner.inspect(), outerShadow: shadowOf(this.ctx) }
      }
    }

    const root = new Context()
    await root.plugin(Inner)
    await root.plugin(Outer)

    let result!: ReturnType<Outer['inspect']>
    await root.inject(['outer'], (ctx: Context) => {
      result = (ctx as Context & { outer: Outer }).outer.inspect()
    })

    expect(result.caller).toBe(outerOrigin)
    expect(result.shadow).toBe(innerOrigin)
    expect(result.outerShadow).toBe(outerOrigin)
  })

  it('exposes the caller to a noShadow service without retaining a shadow', async () => {
    let outerOrigin!: Context

    class Probe {
      [Service.tracker] = { property: 'ctx', noShadow: true }
      constructor(public ctx: Context) {}

      inspect(): { caller: Context | undefined; shadow: Context | undefined } {
        return { caller: callerOf(this), shadow: shadowOf(this.ctx) }
      }
    }

    class Outer extends Service {
      static inject = ['probe']
      constructor(ctx: Context) {
        super(ctx, 'outer')
        outerOrigin = ctx
      }

      inspect(): { caller: Context | undefined; shadow: Context | undefined } {
        return (this.ctx as Context & { probe: Probe }).probe.inspect()
      }
    }

    const root = new Context()
    root.provide('probe', new Probe(root))
    await root.plugin(Outer)

    let result!: ReturnType<Outer['inspect']>
    await root.inject(['outer'], (ctx: Context) => {
      result = (ctx as Context & { outer: Outer }).outer.inspect()
    })

    // `ctx.logger` is exactly this shape: identity-aware, and now reading the
    // caller explicitly rather than through a retained shadow.
    expect(result.caller).toBe(outerOrigin)
    expect(result.shadow).toBeUndefined()
  })

  it('exposes the caller on the callable path, not only on method calls', async () => {
    let outerOrigin!: Context

    // A cordis callable service is a class merged with its own call signature.
    // oxlint-disable-next-line typescript/no-unsafe-declaration-merging
    interface Callable {
      (): Context | undefined
    }

    class Callable extends Service {
      constructor(ctx: Context) {
        super(ctx, 'callable')
      }

      protected [Service.invoke](): Context | undefined {
        return callerOf(this)
      }
    }

    class Outer extends Service {
      static inject = ['callable']
      constructor(ctx: Context) {
        super(ctx, 'outer')
        outerOrigin = ctx
      }

      call(): Context | undefined {
        return (this.ctx as Context & { callable: Callable }).callable()
      }
    }

    const root = new Context()
    await root.plugin(Callable)
    await root.plugin(Outer)

    let caller: Context | undefined
    await root.inject(['outer'], (ctx: Context) => {
      caller = (ctx as Context & { outer: Outer }).outer.call()
    })

    expect(caller).toBe(outerOrigin)
  })
})

describe('vendored cordis logger attribution', () => {
  it('names each plugin log line after its own fiber', async () => {
    const root = new Context()
    const seen: Message[] = []
    root.logger.exporter({ levels: { default: 3 }, export: message => void seen.push(message) })

    await root.plugin({
      name: 'OuterPlugin',
      apply(ctx: Context) {
        ctx.logger.info('outer')
        void ctx.plugin({
          name: 'InnerPlugin',
          apply(inner: Context) {
            inner.logger.info('inner')
          },
        })
      },
    })

    const named = seen.filter(message => message.args[0] === 'outer' || message.args[0] === 'inner')
    expect(named.map(message => [message.name, String(message.args[0])])).toEqual([
      ['outer-plugin', 'outer'],
      ['inner-plugin', 'inner'],
    ])
  })
})
