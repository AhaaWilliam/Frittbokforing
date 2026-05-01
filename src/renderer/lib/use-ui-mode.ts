import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_MODE, MODE_SETTING_KEY, type UiMode } from '../styles/tokens'

/**
 * Sprint 17 — useUiMode-hook (ADR 005).
 *
 * Läser/sätter UI-mode och persisterar i settings (key: `ui_mode`).
 * Synkar `documentElement.dataset.mode` så CSS `[data-mode="..."]`-scopes
 * aktiveras korrekt vid mode-byte.
 *
 * Initialvärde: DEFAULT_MODE (`bokforare`) tills settings är läst.
 * När settings resolverat sätts korrekt mode och `data-mode` uppdateras.
 *
 * **Inte i React Context.** En enkel hook räcker — mode-byte sker sällan
 * och drar inte med sig data-flow som behöver context-broadcast.
 */

function isUiMode(value: unknown): value is UiMode {
  return value === 'vardag' || value === 'bokforare'
}

interface UseUiModeReturn {
  mode: UiMode
  setMode: (mode: UiMode) => void
  /** True medan settings.get pågår vid mount. */
  loading: boolean
}

/**
 * Custom-event för mode-broadcast mellan flera useUiMode-instanser.
 * Eftersom hooken har lokal useState behöver setMode dispatcha event
 * så att ModeRouter (i App.tsx) och AppShellInner-instanser synkas
 * — annars uppdateras bara den anropande komponentens state och vyn
 * byts inte (bara persistensen).
 */
const MODE_CHANGE_EVENT = 'fritt:ui-mode-change'

export function useUiMode(): UseUiModeReturn {
  const [mode, setModeState] = useState<UiMode>(DEFAULT_MODE)
  const [loading, setLoading] = useState(true)

  // Initial-load från settings
  useEffect(() => {
    let cancelled = false
    window.api
      .getSetting(MODE_SETTING_KEY)
      .then((value) => {
        if (cancelled) return
        if (isUiMode(value)) {
          setModeState(value)
          document.documentElement.dataset.mode = value
        }
      })
      .catch(() => {
        // Felaktig settings-läsning ska inte krascha appen — fall tillbaka
        // på DEFAULT_MODE som redan är satt.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Lyssna på mode-broadcast så alla useUiMode-instanser synkas
  useEffect(() => {
    function onModeChange(e: Event) {
      const detail = (e as CustomEvent<UiMode>).detail
      if (isUiMode(detail)) {
        setModeState(detail)
        document.documentElement.dataset.mode = detail
      }
    }
    window.addEventListener(MODE_CHANGE_EVENT, onModeChange)
    return () => window.removeEventListener(MODE_CHANGE_EVENT, onModeChange)
  }, [])

  const setMode = useCallback((newMode: UiMode) => {
    setModeState(newMode)
    document.documentElement.dataset.mode = newMode
    // Broadcasta till andra useUiMode-instanser (ModeRouter etc.)
    window.dispatchEvent(
      new CustomEvent(MODE_CHANGE_EVENT, { detail: newMode }),
    )
    window.api.setSetting(MODE_SETTING_KEY, newMode).catch(() => {
      // Persistens-fel är icke-fatalt — användaren kan sätta om mode
      // nästa session.
    })
  }, [])

  return { mode, setMode, loading }
}
