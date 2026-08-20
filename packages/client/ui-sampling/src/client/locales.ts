/**
 * Copy for the composer temperature control.
 * @module @deepseek-ai/dsh-client-ui-sampling/client/locales
 */

/** Dictionary keys this control renders. */
export type SamplingKey = 'label' | 'auto' | 'reset' | 'title' | 'titleAuto'

/** English copy. */
export const en: Record<SamplingKey, string> = {
  label: 'Temp',
  auto: 'auto',
  reset: 'Use the model default',
  title: 'Sampling temperature sent with each request',
  titleAuto: 'No temperature is sent, so the model default applies',
}

/** Simplified Chinese copy. */
export const zh: Record<SamplingKey, string> = {
  label: '温度',
  auto: '默认',
  reset: '使用模型默认值',
  title: '每次请求发送的采样温度',
  titleAuto: '不发送温度，使用模型默认值',
}
