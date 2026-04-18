import { useCallback, useEffect, useRef, type RefObject } from 'react'

/**
 * Sprint K (F49-c3) — Dialog focus-trap + Escape + focus-return.
 *
 * @deprecated Sprint P — alla 6 dialoger migrerade till Radix-primitives
 * (ADR 003, Alt A). Radix exponerar samma fyra pelare via deklarativ
 * struktur (`<Dialog.Root/Portal/Overlay/Content>`), plus inert/scroll-
 * lock/portal som useDialogBehavior saknade. Nya dialoger ska använda
 * `@radix-ui/react-dialog` eller `@radix-ui/react-alert-dialog`.
 *
 * Filen + testet behålls tills vi är säkra att ingen ny kod importerar
 * hooken. Radera i Sprint Q eller senare.
 *
 * Spec: docs/f49c-keyboard-nav-spec.md § 6 (ARIA-invarianter bevaras i
 * Radix; implementation-detaljer skiljer sig).
 *
 * Centraliserade beteendet som alla modala dialoger i renderer delade:
 * 1. **Focus-trap:** Tab cyklar inom containern (shift+Tab → last).
 * 2. **Escape stänger.** onClose anropas; e.stopPropagation() undviker
 *    propagering till yttre dialog (nested-support, § 6.4).
 * 3. **Auto-focus vid open.** `initialFocusRef` om specificerat, annars
 *    första fokuserbara elementet i containern. (Specen § 6.1: Cancel
 *    bibehålls som default för destruktiva.)
 * 4. **Focus-return vid close.** Fokus återförs till det element som
 *    hade fokus när dialogen öppnades — normalt triggern.
 *    **Känd begränsning (§ 6.3):** Om triggern unmountas medan dialogen
 *    är öppen hamnar fokus på `<body>`. Dokumenterat som acceptabelt.
 */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [tabindex="0"], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href]'

export interface UseDialogBehaviorOptions {
  open: boolean
  onClose: () => void
  /** Ref till dialog-panelens rot-element (där fokus ska trappas). */
  containerRef: RefObject<HTMLElement | null>
  /** Ref till elementet som ska få initial fokus. Om null → första
   *  fokuserbara elementet i containern. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

export function useDialogBehavior({
  open,
  onClose,
  containerRef,
  initialFocusRef,
}: UseDialogBehaviorOptions): {
  onKeyDown: (e: React.KeyboardEvent) => void
} {
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null
      const target =
        initialFocusRef?.current ??
        containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      target?.focus()
    } else if (prevFocusRef.current) {
      // Återställ fokus bara om triggern fortfarande finns i DOM
      if (document.body.contains(prevFocusRef.current)) {
        prevFocusRef.current.focus()
      }
      prevFocusRef.current = null
    }
  }, [open, containerRef, initialFocusRef])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable =
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    },
    [open, onClose, containerRef],
  )

  return { onKeyDown }
}
