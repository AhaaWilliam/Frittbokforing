import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

/**
 * Sprint 23 — BottomSheet primitive (ADR 003 + ADR 005).
 *
 * Bottom-positionerad modal. Slidar upp från botten på smala viewports
 * (touch-vänligt), centreras som vanlig dialog på lg+ desktop.
 *
 * Implementation:
 * - Bygger på @radix-ui/react-dialog för att ärva alla a11y-egenskaper
 *   (focus-trap, scroll-lock, inert på bakgrund, Escape-close)
 * - Custom positionering via fixed inset-x-0 bottom-0 + override:bar Radix
 *   default-centrering på smala viewports
 * - Drag-handle är dekorativ (visual cue, ej draggable). Stäng via
 *   Escape, klick på overlay, eller en explicit close-knapp i content.
 *
 * **Användning:** för flöden där användaren ska göra ett snabbt val/input
 * utan att lämna sidan — quick-spend i Vardag, snabb-betalning, etc.
 *
 * För komplexa flöden använd centrala dialoger eller sub-views; bottom-
 * sheet är optimerad för korta input-flöden (≤5 fält) där användaren
 * är fokuserad på en uppgift.
 */

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Visas i sheet-rubriken. */
  title: string
  /**
   * Beskrivning under rubriken — valfri men rekommenderad för screen
   * readers (Radix använder den för aria-describedby).
   */
  description?: string
  children: ReactNode
  /** Custom className på Dialog.Content. */
  className?: string
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[var(--z-overlay)] bg-black/40"
          data-testid="bottom-sheet-overlay"
        />
        <Dialog.Content
          className={[
            'fixed inset-x-0 bottom-0 z-[var(--z-modal)]',
            'mx-auto w-full max-w-2xl',
            'rounded-t-2xl bg-white shadow-sheet',
            'lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[min(640px,90vw)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl',
            className ?? '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="bottom-sheet"
        >
          {/* Drag-handle (visual cue) — dold på lg där den blir vanlig dialog */}
          <div
            className="flex justify-center pb-1 pt-3 lg:hidden"
            aria-hidden="true"
          >
            <span className="h-1 w-10 rounded-full bg-neutral-300" />
          </div>

          <div className="px-6 py-4">
            <Dialog.Title className="font-display text-xl font-semibold text-neutral-900">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description className="mt-1 text-sm text-neutral-500">
                {description}
              </Dialog.Description>
            )}
          </div>

          <div className="px-6 pb-6" data-testid="bottom-sheet-body">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Trigger-helper för bottom-sheet — knapp som öppnar sheet.
 * Inte obligatorisk; konsumenten kan styra `open`-state hur de vill.
 */
export function BottomSheetClose({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        className={
          className ??
          'rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50'
        }
      >
        {children}
      </button>
    </Dialog.Close>
  )
}
