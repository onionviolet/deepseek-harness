/** Composer temperature control over the Host plugin's live Config form. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TemperatureBar } from './TemperatureBar.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Composer sampling labels. */
    'ui.sampling': 'temperature' | 'label' | 'auto' | 'error'
  }
}

/** Required registration, localization, and configuration services. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Register the optional temperature control while its Host form is available.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  const en = { temperature: 'Temperature', label: 'Temp', auto: 'Auto', error: 'Temperature was not saved' }
  const zh = { temperature: '温度', label: '温度', auto: '自动', error: '温度未保存' }
  ctx.effect(() => ctx.locale.register('ui.sampling', { en, zh }), 'sampling: labels')
  const form = ctx.configForms.get<{ temperature?: number }>('llm-sampling')
  ctx.effect(() => ctx.configForms.whileServed(['llm-sampling'], () =>
    ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
      name: 'conversation.input.right', id: 'sampling-temperature', order: 10,
      locale: 'ui.sampling',
      inject: () => ({
        hooks: { sampling: form },
        setTemperature: (value: number) => form.set('temperature', value),
        clearTemperature: () => form.unset('temperature'),
      }),
    }, TemperatureBar))), 'sampling: composer control')
}
