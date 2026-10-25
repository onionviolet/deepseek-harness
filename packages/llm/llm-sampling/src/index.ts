/** Optional profile temperature override, recorded by the normal request header. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'

/** Live request sampling configuration. */
export interface Config {
  /** Explicit temperature; omission restores the adapter or model default. */
  temperature: Volatile<number | undefined>
}

/** Temperature accepted by the composer control and live settings form. */
export const Config = z.object({ temperature: z.number().min(0).max(2).volatile() })

/**
 * Apply the configured temperature after downstream request controls resolve.
 * Clearing the override also clears a temperature retained by a prior request.
 * @param ctx - Plugin context owning the request listener.
 * @param config - Live temperature reference.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('agent/request', async (_payload, next) => {
    const { temperature: _previous, ...request } = await next()
    const temperature = config.temperature.get()
    return temperature === undefined ? request : { ...request, temperature }
  })
}
