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

  const setMode = useCallback((newMode: UiMode) => {
    setModeState(newMode)
    document.documentElement.dataset.mode = newMode
    window.api.setSetting(MODE_SETTING_KEY, newMode).catch(() => {
      // Persistens-fel är icke-fatalt — användaren kan sätta om mode
      // nästa session.
    })
  }, [])

  return { mode, setMode, loading }
}
