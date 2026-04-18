// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDialogBehavior } from '../../../src/renderer/lib/use-dialog-behavior'

function TestDialog({
  open,
  onClose,
  autoFocusCancel = true,
}: {
  open: boolean
  onClose: () => void
  autoFocusCancel?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const { onKeyDown } = useDialogBehavior({
    open,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: autoFocusCancel ? cancelRef : undefined,
  })
  if (!open) return null
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div data-testid="backdrop" onKeyDown={onKeyDown}>
      <div ref={dialogRef} role="dialog" aria-modal="true">
        <button ref={cancelRef} data-testid="cancel">
          Cancel
        </button>
        <input data-testid="input" />
        <button data-testid="confirm">Confirm</button>
      </div>
    </div>
  )
}

function Wrapper({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        Open
      </button>
      <TestDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('useDialogBehavior', () => {
  it('Escape anropar onClose', async () => {
    const onClose = vi.fn()
    render(<TestDialog open={true} onClose={onClose} />)
    screen.getByTestId('cancel').focus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape när open=false är no-op', async () => {
    const onClose = vi.fn()
    const { rerender } = render(<TestDialog open={true} onClose={onClose} />)
    // När open=false renderar komponenten null → ingen Escape-handler
    rerender(<TestDialog open={false} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Tab cyklar till första elementet när fokus är på sista', async () => {
    render(<TestDialog open={true} onClose={() => {}} />)
    const confirm = screen.getByTestId('confirm')
    confirm.focus()
    expect(document.activeElement).toBe(confirm)
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(screen.getByTestId('cancel'))
  })

  it('Shift+Tab cyklar till sista elementet när fokus är på första', async () => {
    render(<TestDialog open={true} onClose={() => {}} />)
    const cancel = screen.getByTestId('cancel')
    cancel.focus()
    expect(document.activeElement).toBe(cancel)
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(document.activeElement).toBe(screen.getByTestId('confirm'))
  })

  it('auto-focus på initialFocusRef vid open', () => {
    const { rerender } = render(
      <TestDialog open={false} onClose={() => {}} />,
    )
    rerender(<TestDialog open={true} onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByTestId('cancel'))
  })

  it('auto-focus på första fokuserbara om initialFocusRef saknas', () => {
    const { rerender } = render(
      <TestDialog open={false} onClose={() => {}} autoFocusCancel={false} />,
    )
    rerender(
      <TestDialog open={true} onClose={() => {}} autoFocusCancel={false} />,
    )
    // Första fokuserbara = cancel (trots att initialFocusRef inte skickas)
    expect(document.activeElement).toBe(screen.getByTestId('cancel'))
  })

  it('focus återförs till triggern när dialogen stängs', async () => {
    render(<Wrapper initialOpen={false} />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    // Öppna via klick
    await userEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByTestId('cancel'))

    // Stäng via Escape
    await userEvent.keyboard('{Escape}')
    // Efter close ska fokus återgå till trigger
    expect(document.activeElement).toBe(trigger)
  })

  it('focus-återgång no-op om triggern unmountats (body-fallback)', async () => {
    function ConditionalTrigger() {
      const [open, setOpen] = useState(false)
      const [triggerMounted, setTriggerMounted] = useState(true)
      return (
        <>
          {triggerMounted && (
            <button
              data-testid="trigger"
              onClick={() => {
                setOpen(true)
                setTriggerMounted(false) // Trigger unmountas omedelbart
              }}
            >
              Open
            </button>
          )}
          <TestDialog open={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    render(<ConditionalTrigger />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    await userEvent.click(trigger)
    // Trigger är nu unmountad, dialog öppen + cancel fokuserad
    expect(screen.queryByTestId('trigger')).toBeNull()
    // Stäng dialogen
    await userEvent.keyboard('{Escape}')
    // Fokus ska INTE försöka återgå till unmountad trigger (ingen kasch)
    expect(document.activeElement).not.toBe(trigger)
  })

  it('Tab i mitten av fokus-kedja är naturlig (ingen trap-intervention)', async () => {
    render(<TestDialog open={true} onClose={() => {}} />)
    screen.getByTestId('cancel').focus()
    await userEvent.keyboard('{Tab}')
    // Fokus flyttas naturligt till input (browser-default), inte trap
    expect(document.activeElement).toBe(screen.getByTestId('input'))
  })

  it('e.stopPropagation vid Escape — yttre handler kallas inte', async () => {
    const outerEscape = vi.fn()
    const onClose = vi.fn()
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        onKeyDown={(e) => {
          if (e.key === 'Escape') outerEscape()
        }}
      >
        <TestDialog open={true} onClose={onClose} />
      </div>,
    )
    screen.getByTestId('cancel').focus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(outerEscape).not.toHaveBeenCalled()
  })
})
