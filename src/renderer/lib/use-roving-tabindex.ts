import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Sprint J (F49-c2) — Roving-tabindex för tabell-rad-navigering.
 *
 * Spec: docs/f49c-keyboard-nav-spec.md § 4 (Alt B).
 *
 * Mönster:
 * - Enbart en rad har `tabIndex=0` vid varje tidpunkt (den "aktiva" raden)
 * - Alla andra rader har `tabIndex=-1`
 * - ↑↓ flyttar aktiv index + fokuserar ny rad
 * - Home/End hoppar till första/sista raden
 * - Enter triggar onSelect(idx) (t.ex. navigera till detaljvy)
 * - Tab lämnar listan direkt (bara activeIdx är tabbar-bar)
 * - onFocus-bubbling från klick/fokus i raden synkar activeIdx
 *
 * Spread `getRowProps(idx)` på varje `<tr>`-element. Hooken lagrar
 * ref:er per rad för programmatisk focus vid arrow-navigation.
 */
export interface RovingRowProps {
  ref: (el: HTMLElement | null) => void
  tabIndex: 0 | -1
  onKeyDown: (e: React.KeyboardEvent) => void
  onFocus: () => void
}

export function useRovingTabindex(
  rowCount: number,
  onSelect?: (idx: number) => void,
): {
  activeIdx: number
  getRowProps: (idx: number) => RovingRowProps
} {
  const [activeIdx, setActiveIdx] = useState(0)
  const rowRefs = useRef<Array<HTMLElement | null>>([])

  // Clamp activeIdx om rowCount krymper (t.ex. filter-byte)
  useEffect(() => {
    if (rowCount === 0) return
    if (activeIdx >= rowCount) setActiveIdx(rowCount - 1)
  }, [rowCount, activeIdx])

  const focusRow = useCallback((idx: number) => {
    setActiveIdx(idx)
    rowRefs.current[idx]?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (e.key === 'ArrowDown' && idx < rowCount - 1) {
        e.preventDefault()
        focusRow(idx + 1)
      } else if (e.key === 'ArrowUp' && idx > 0) {
        e.preventDefault()
        focusRow(idx - 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        focusRow(0)
      } else if (e.key === 'End' && rowCount > 0) {
        e.preventDefault()
        focusRow(rowCount - 1)
      } else if (e.key === 'Enter' && onSelect) {
        e.preventDefault()
        onSelect(idx)
      }
    },
    [rowCount, focusRow, onSelect],
  )

  const getRowProps = useCallback(
    (idx: number): RovingRowProps => ({
      ref: (el: HTMLElement | null) => {
        rowRefs.current[idx] = el
      },
      tabIndex: idx === activeIdx ? 0 : -1,
      onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, idx),
      onFocus: () => setActiveIdx(idx),
    }),
    [activeIdx, handleKeyDown],
  )

  return { activeIdx, getRowProps }
}
