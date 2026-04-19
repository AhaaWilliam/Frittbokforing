import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

/**
 * WAI-ARIA 1.2 combobox keyboard behavior via `aria-activedescendant`
 * pattern — input behåller fokus, "aktiv" option byts via state.
 *
 * Användning:
 *   const kb = useComboboxKeyboard({
 *     items: customers,
 *     isOpen: open,
 *     onSelect: (c) => { ... },
 *     onClose: () => setOpen(false),
 *     getItemId: (_, i) => `${listboxId}-opt-${i}`,
 *   })
 *   <input ... onKeyDown={kb.handleKeyDown} aria-activedescendant={kb.activeId} />
 *   <li id={kb.optionId(i)} aria-selected={kb.activeIndex === i} />
 *
 * Tangentbindingar (när isOpen):
 * - ArrowDown/ArrowUp: cyklisk nav
 * - Home/End: första/sista
 * - Enter: aktivera aktiv option (eller trailingAction om dess index)
 * - Escape: onClose + reset
 *
 * trailingAction: valfri sista rad som inte är en "option" (t.ex. "+ Ny X").
 * Ingår i tangentbordsrotationen men aktiverar sin egen callback.
 *
 * Aktiv option scroll:as automatiskt in i vyn via scrollIntoView.
 */
export interface UseComboboxKeyboardOptions<T> {
  items: T[] | undefined
  isOpen: boolean
  onSelect: (item: T) => void
  onClose: () => void
  /** Unikt id per option — används för aria-activedescendant + id-attribute */
  getItemId: (item: T, index: number) => string
  /** Valfri "footer"-action som ingår i tangentbordsnav (t.ex. "+ Ny") */
  trailingAction?: {
    id: string
    onActivate: () => void
  }
  /** Container för scroll-into-view (default: document.getElementById(activeId)) */
  listboxRef?: RefObject<HTMLElement | null>
}

export interface UseComboboxKeyboardReturn {
  activeIndex: number
  activeId: string | undefined
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  isActive: (index: number) => boolean
  isTrailingActive: () => boolean
}

export function useComboboxKeyboard<T>(
  options: UseComboboxKeyboardOptions<T>,
): UseComboboxKeyboardReturn {
  const { items, isOpen, onSelect, onClose, getItemId, trailingAction } =
    options
  const [activeIndex, setActiveIndex] = useState(-1)

  const optionsList = items ?? []
  const totalCount = optionsList.length + (trailingAction ? 1 : 0)

  // Reset när dropdown stängs
  useEffect(() => {
    if (!isOpen) setActiveIndex(-1)
  }, [isOpen])

  // Clamp activeIndex när items ändras (debounced search)
  useEffect(() => {
    if (activeIndex >= totalCount) setActiveIndex(-1)
  }, [totalCount, activeIndex])

  // Scroll aktiv option i vy
  const activeId =
    activeIndex < 0
      ? undefined
      : activeIndex < optionsList.length
        ? getItemId(optionsList[activeIndex], activeIndex)
        : trailingAction?.id

  const activeIdRef = useRef<string | undefined>(activeId)
  activeIdRef.current = activeId

  useEffect(() => {
    if (!activeId) return
    const el = document.getElementById(activeId)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [activeId])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return
      if (totalCount === 0 && e.key !== 'Escape') return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i) => (i + 1 >= totalCount ? 0 : i + 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i) => (i <= 0 ? totalCount - 1 : i - 1))
          break
        case 'Home':
          e.preventDefault()
          setActiveIndex(0)
          break
        case 'End':
          e.preventDefault()
          setActiveIndex(totalCount - 1)
          break
        case 'Enter': {
          if (activeIndex < 0) return
          e.preventDefault()
          if (activeIndex < optionsList.length) {
            onSelect(optionsList[activeIndex])
          } else if (trailingAction) {
            trailingAction.onActivate()
          }
          break
        }
        case 'Escape':
          e.preventDefault()
          onClose()
          setActiveIndex(-1)
          break
      }
    },
    [isOpen, totalCount, activeIndex, optionsList, onSelect, onClose, trailingAction],
  )

  const isActive = useCallback(
    (index: number) => activeIndex === index,
    [activeIndex],
  )
  const isTrailingActive = useCallback(
    () => activeIndex === optionsList.length && !!trailingAction,
    [activeIndex, optionsList.length, trailingAction],
  )

  return { activeIndex, activeId, handleKeyDown, isActive, isTrailingActive }
}
