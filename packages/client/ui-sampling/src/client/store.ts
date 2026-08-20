/**
 * Temperature control slot store: a mirror of the `llm-sampling` settings
 * section. The plugin's apply-world subscription is the only writer; the
 * component reads through `props.useStore`.
 * @module @deepseek-ai/dsh-client-ui-sampling/client/store
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** State mirrored from the settings snapshot. */
export interface TemperatureBarState {
  /** Stored temperature, or undefined when the Modelfile decides. */
  temperature: number | undefined
  /** Whether the Host document accepts writes; a read-only document disables the control. */
  writable: boolean
  /** True until the first accepted section, so the control can stay inert. */
  loading: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
export type TemperatureBarActions = {
  sync: (draft: TemperatureBarState, temperature: number | undefined, writable: boolean, loading: boolean) => void
}

/**
 * Declares the temperature control state and its write surface.
 * @returns the store handle.
 */
export function createTemperatureBarStore(): EngineStoreHandle<TemperatureBarState, TemperatureBarActions> {
  return defineStore({
    init: (): TemperatureBarState => ({ temperature: undefined, writable: false, loading: true }),
    actions: {
      sync: (d, temperature: number | undefined, writable: boolean, loading: boolean) => {
        d.temperature = temperature
        d.writable = writable
        d.loading = loading
      },
    },
  })
}
