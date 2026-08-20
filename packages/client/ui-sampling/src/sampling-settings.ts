/**
 * Settings identities shared by the Host plugin that owns the section and the
 * browser control that edits it.
 * @module @deepseek-ai/dsh-client-ui-sampling/sampling-settings
 */

/** Namespace registered by the Host `llm-sampling` plugin. */
export const SAMPLING_SETTINGS_NAMESPACE = 'llm-sampling'

/** Scalar field carrying the default temperature applied to every model. */
export const TEMPERATURE_FIELD = 'temperature'

/** Lowest temperature the control offers. */
export const TEMPERATURE_MIN = 0

/**
 * Highest temperature the control offers. Ollama accepts more, but nothing
 * above 2 is useful on a thinking model, and a typo of 20 for 2.0 would
 * produce noise rather than an error.
 */
export const TEMPERATURE_MAX = 2

/** Drag granularity, fine enough to reach the values people actually pick. */
export const TEMPERATURE_STEP = 0.05

/** The `llm-sampling` section as this control reads it. */
export interface SamplingSettings {
  /**
   * Default temperature sent on every request. Absent means the control sends
   * none, so each Ollama tag keeps its own Modelfile temperature.
   */
  temperature?: number
  /** Per-model-id overrides, edited elsewhere and preserved by this control. */
  perModel?: Record<string, number>
}
