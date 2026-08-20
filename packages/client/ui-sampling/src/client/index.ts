/**
 * Composer sampling control. Binds the Host `llm-sampling` settings section to
 * a draggable temperature bar in the composer tool row. Temperature rides the
 * request, so changing it costs no Ollama model reload.
 * @module @deepseek-ai/dsh-client-ui-sampling/client
 */
import type { BakedActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.settingsScope Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the conversation package's composer slot declarations.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TemperatureBarInjected } from './TemperatureBar.tsx'
import { TemperatureBar } from './TemperatureBar.tsx'
import { createTemperatureBarStore } from './store.ts'
import type { TemperatureBarActions, TemperatureBarState } from './store.ts'
import { en, zh, type SamplingKey } from './locales.ts'
import {
  SAMPLING_SETTINGS_NAMESPACE, TEMPERATURE_FIELD, type SamplingSettings,
} from '../sampling-settings.ts'

export type { TemperatureBarComponentProps, TemperatureBarInjected } from './TemperatureBar.tsx'
export type { TemperatureBarState } from './store.ts'
export type { SamplingKey } from './locales.ts'

/** Namespace owning this control's copy. */
export const SETTINGS_NS = 'ui.sampling'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer temperature control's copy. */
    'ui.sampling': SamplingKey
  }
}

/**
 * Required services: the settings transport plus slots and locale for the
 * composer seat. `remote` carries the forwarded settings invalidation the
 * bound scope subscribes to.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

/**
 * Client plugin body: bind the sampling settings section and register the
 * temperature control into the composer tool row.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const scope: SettingsScope<SamplingSettings> = ctx.settingsScope.bind<SamplingSettings>({
    namespace: SAMPLING_SETTINGS_NAMESPACE,
    // Explicit decoder rather than the default schema validation. The Host
    // section carries a `perModel` dict this control never edits, and a
    // rehydration failure on that field would drop the whole section to
    // undefined, leaving the bar permanently on `auto`. Only `temperature`
    // is read here, so only it is narrowed.
    decode: (section) => {
      if (typeof section !== 'object' || section === null) return undefined
      const raw: unknown = (section as { temperature?: unknown }).temperature
      return typeof raw === 'number' && Number.isFinite(raw) ? { temperature: raw } : {}
    },
  })

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-sampling: control dictionaries')

  const store = createTemperatureBarStore()
  // The slot is session-scoped, so each open session binds its own store copy
  // while the setting itself is global. Every bound copy is kept so one
  // settings change reaches all of them.
  const bound = new Set<BakedActions<TemperatureBarState, TemperatureBarActions>>()
  const push = (actions: BakedActions<TemperatureBarState, TemperatureBarActions>): void => {
    const snapshot = scope.getSnapshot()
    actions.sync(snapshot.value?.temperature, snapshot.writable, snapshot.status === 'loading')
  }
  const sync = (): void => { for (const actions of bound) push(actions) }
  ctx.effect(() => scope.subscribe(sync), 'ui-sampling: settings scope adoption')

  const injected = (
    _sessionId: SessionId,
    actions: BakedActions<TemperatureBarState, TemperatureBarActions>,
  ): TemperatureBarInjected => {
    bound.add(actions)
    // Re-sync from the getter so no change is lost between registration and
    // first render.
    push(actions)
    return {
      setTemperature: (value) => { void scope.set(TEMPERATURE_FIELD, value) },
      clearTemperature: () => { void scope.unset(TEMPERATURE_FIELD) },
    }
  }

  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: 'sampling-temperature',
    order: 10,
    store,
    locale: SETTINGS_NS,
    inject: injected,
  }, TemperatureBar))
}
