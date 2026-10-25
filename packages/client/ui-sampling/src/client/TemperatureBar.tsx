/** Range, numeric entry, and reset for one persisted profile temperature. */
import { useState } from 'react'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './TemperatureBar.module.css'

/** Plain actions and the form observable bound by the renderer. */
interface SamplingFace {
  hooks: { sampling: HostObservable<ConfigFormSnapshot<{ temperature?: number }>> }
  setTemperature(value: number): Promise<boolean>
  clearTemperature(): Promise<boolean>
}

/** Five-share props supplied by the composer slot registration. */
type Props = PropsRuntime<'conversation.input.right'> & PropsLocale<'ui.sampling'> & InjectFace<SamplingFace>

/**
 * Render sampling controls; report rejected writes without claiming persistence.
 * @param props - Bound form snapshot, localized labels, and write callbacks.
 * @returns The composer controls.
 */
export function TemperatureBar(props: Props) {
  const snapshot = props.useSampling(value => value)
  const [draft, setDraft] = useState<number | undefined>()
  const [failed, setFailed] = useState(false)
  const stored = snapshot.value?.temperature
  const disabled = snapshot.status !== 'ready' || !snapshot.writable
  const save = async (value: number | undefined) => {
    try {
      setFailed(!await (value === undefined ? props.clearTemperature() : props.setTemperature(value)))
    } catch {
      // Transport errors leave the accepted form snapshot authoritative.
      setFailed(true)
    } finally {
      setDraft(undefined)
    }
  }
  return <div className={css.root} title={props.t('temperature')}>
    <label>{props.t('label')}
      <input type="range" min="0" max="2" step="0.05"
        aria-label={props.t('temperature')} value={draft ?? stored ?? 1} disabled={disabled}
        onChange={(event) => { setDraft(event.currentTarget.valueAsNumber) }}
        onPointerUp={(event) => { void save(event.currentTarget.valueAsNumber) }}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
            void save(event.currentTarget.valueAsNumber)
          }
        }}
        onBlur={(event) => { if (draft !== undefined) void save(event.currentTarget.valueAsNumber) }} />
    </label>
    <input type="number" min="0" max="2" step="0.05" className={css.number}
      aria-label={props.t('temperature')} placeholder={props.t('auto')}
      value={draft ?? stored ?? ''} disabled={disabled}
      onChange={(event) => {
        const value = event.currentTarget.valueAsNumber
        if (Number.isNaN(value)) void save(undefined)
        else if (value >= 0 && value <= 2) void save(value)
      }} />
    <button type="button" disabled={disabled || stored === undefined}
      onClick={() => { void save(undefined) }}>{props.t('auto')}</button>
    {failed && <span role="alert">{props.t('error')}</span>}
  </div>
}
