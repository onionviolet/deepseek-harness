/**
 * Sampling control plugin, node half. Pure UI plugin: the empty apply exists
 * so the plugin appears in the host cordis.yml / Loader; the browser half
 * ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 * @module @deepseek-ai/dsh-client-ui-sampling
 */

export {
  SAMPLING_SETTINGS_NAMESPACE, TEMPERATURE_FIELD, TEMPERATURE_MAX, TEMPERATURE_MIN,
  TEMPERATURE_STEP, type SamplingSettings,
} from './sampling-settings.ts'

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
