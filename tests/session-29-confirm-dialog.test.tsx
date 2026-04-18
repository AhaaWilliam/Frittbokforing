// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import axe from 'axe-core'
import { ConfirmDialog } from '../src/renderer/components/ui/ConfirmDialog'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Test"
        description="Test desc"
        onConfirm={vi.fn()}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title and description when open', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Ta bort utkast"
        description="Vill du verkligen ta bort?"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Ta bort utkast')).toBeInTheDocument()
    expect(screen.getByText('Vill du verkligen ta bort?')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Test"
        description="Test"
        confirmLabel="Ja, ta bort"
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByText('Ja, ta bort'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onOpenChange(false) when cancel button clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Test"
        description="Test"
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Avbryt'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape key', () => {
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Test"
        description="Test"
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('has correct ARIA associations', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Dialog title"
        description="Dialog desc"
        onConfirm={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('alertdialog')
    // Radix AlertDialog applicerar inte aria-modal på elementet utan
    // hanterar modalitet via inert/aria-hidden på utanför-innehållet.
    // Semantiskt likvärdigt per ARIA 1.2 (role=alertdialog implicerar modal).
    const labelledBy = dialog.getAttribute('aria-labelledby')
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(labelledBy).not.toBeNull()
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(labelledBy!)).toHaveTextContent(
      'Dialog title',
    )
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Dialog desc',
    )
  })

  it('passes axe-core a11y check', async () => {
    const { container } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="A11y test"
        description="Testing accessibility"
        onConfirm={vi.fn()}
      />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
