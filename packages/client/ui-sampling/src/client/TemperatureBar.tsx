/**
 * Sampling-temperature control registered into the composer tool row
 * (`conversation.input.right`): a draggable bar, a numeric field, and a reset
 * to the model default. Editing it costs no model reload, because the value
 * rides the request rather than the Ollama Modelfile.
 */
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the conversation package's composer slot declarations.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { createTemperatureBarStore } from './store.ts'
import { TEMPERATURE_MAX, TEMPERATURE_MIN, TEMPERATURE_STEP } from '../sampling-settings.ts'
import css from './TemperatureBar.module.css'

/** Injected business face: the two settings writes. */
export interface TemperatureBarInjected {
  /** Store one temperature, applied to every model without a per-model override. */
  setTemperature: (value: number) => void
  /** Clear the stored temperature so each model falls back to its own default. */
  clearTemperature: () => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type TemperatureBarComponentProps =
  PropsRuntime<'conversation.input.right'> & PropsStore<ReturnType<typeof createTemperatureBarStore>>
  & PropsLocale<'ui.sampling'> & TemperatureBarInjected

/** Value the bar rests on while no temperature is stored. */
const NEUTRAL = 1

/**
 * Clamp and round one candidate to the offered range and step, so a typed
 * value and a dragged value cannot disagree about what is storable.
 * @param value - candidate temperature.
 * @returns the nearest storable temperature.
 */
function quantize(value: number): number {
  const clamped = Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, value))
  // Rounded to two decimals: the step division alone yields values like
  // 0.35000000000000003, which reach both the field and the stored setting.
  return Math.round(clamped / TEMPERATURE_STEP) * TEMPERATURE_STEP === 0
    ? 0
    : Number((Math.round(clamped / TEMPERATURE_STEP) * TEMPERATURE_STEP).toFixed(2))
}

/**
 * Render the composer temperature control.
 * @param props - composed slot props.
 * @returns the control element tree.
 */
export function TemperatureBar({ t, useStore, setTemperature, clearTemperature }: TemperatureBarComponentProps) {
  const stored = useStore(s => s.temperature)
  const writable = useStore(s => s.writable)
  const loading = useStore(s => s.loading)

  // Held only while the pointer is down, so dragging stays smooth without a
  // settings round trip per pixel. Cleared once the store echoes the write.
  const [dragging, setDragging] = useState<number | undefined>(undefined)
  useEffect(() => { setDragging(undefined) }, [stored])

  const auto = stored === undefined
  const shown = dragging ?? stored ?? NEUTRAL
  const disabled = loading || !writable

  return (
    <div className={clsx(css.root, auto && css.auto)} title={auto ? t('titleAuto') : t('title')}>
      <span className={css.label}>{t('label')}</span>
      <input
        type="range"
        className={css.bar}
        min={TEMPERATURE_MIN}
        max={TEMPERATURE_MAX}
        step={TEMPERATURE_STEP}
        value={shown}
        disabled={disabled}
        aria-label={t('title')}
        onChange={(event) => { setDragging(quantize(event.target.valueAsNumber)) }}
        onPointerUp={() => { if (dragging !== undefined) setTemperature(dragging) }}
        onKeyUp={() => { if (dragging !== undefined) setTemperature(dragging) }}
        onBlur={() => { if (dragging !== undefined) setTemperature(dragging) }}
      />
      <input
        type="number"
        className={css.field}
        min={TEMPERATURE_MIN}
        max={TEMPERATURE_MAX}
        step={TEMPERATURE_STEP}
        value={auto && dragging === undefined ? '' : String(shown)}
        placeholder={t('auto')}
        disabled={disabled}
        aria-label={t('title')}
        onChange={(event) => {
          const next = event.target.valueAsNumber
          if (Number.isNaN(next)) { clearTemperature(); return }
          setTemperature(quantize(next))
        }}
      />
      <button
        type="button"
        className={css.reset}
        title={t('reset')}
        aria-label={t('reset')}
        disabled={disabled || auto}
        onClick={() => { clearTemperature() }}
      >
        {t('auto')}
      </button>
    </div>
  )
}
