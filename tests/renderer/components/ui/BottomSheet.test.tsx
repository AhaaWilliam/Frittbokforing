// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import {
  BottomSheet,
  BottomSheetClose,
} from '../../../../src/renderer/components/ui/BottomSheet'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('BottomSheet', () => {
  it('renders when open=true', () => {
    render(
      <BottomSheet open={true} onOpenChange={vi.fn()} title="Test">
        <p>Body</p>
      </BottomSheet>,
    )
    expect(screen.getByTestId('bottom-sheet')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(
      <BottomSheet open={false} onOpenChange={vi.fn()} title="Test">
        <p>Body</p>
      </BottomSheet>,
    )
    expect(screen.queryByTestId('bottom-sheet')).not.toBeInTheDocument()
  })

  it('renders title and description', () => {
    render(
      <BottomSheet
        open={true}
        onOpenChange={vi.fn()}
        title="Ny kostnad"
        description="Quick-input"
      >
        <p>x</p>
      </BottomSheet>,
    )
    expect(screen.getByText('Ny kostnad')).toBeInTheDocument()
    expect(screen.getByText('Quick-input')).toBeInTheDocument()
  })

  it('Escape stänger via onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    render(
      <BottomSheet open={true} onOpenChange={onOpenChange} title="X">
        <p>x</p>
      </BottomSheet>,
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('BottomSheetClose stänger sheet', async () => {
    const onOpenChange = vi.fn()
    render(
      <BottomSheet open={true} onOpenChange={onOpenChange} title="X">
        <BottomSheetClose>Avbryt</BottomSheetClose>
      </BottomSheet>,
    )
    await userEvent.click(screen.getByText('Avbryt'))
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('uses Radix Dialog ARIA-shape', () => {
    render(
      <BottomSheet open={true} onOpenChange={vi.fn()} title="X" description="d">
        <p>body</p>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog.getAttribute('aria-labelledby')).not.toBeNull()
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull()
  })

  it('drag-handle is aria-hidden', () => {
    const { container } = render(
      <BottomSheet open={true} onOpenChange={vi.fn()} title="X">
        <p>x</p>
      </BottomSheet>,
    )
    // Drag-handle div har aria-hidden=true
    const handle = container.ownerDocument.querySelector('[aria-hidden="true"]')
    expect(handle).not.toBeNull()
  })

  it('passes axe a11y check', async () => {
    const { container } = render(
      <BottomSheet
        open={true}
        onOpenChange={vi.fn()}
        title="Test sheet"
        description="A descriptive description"
      >
        <form>
          <label htmlFor="x">Field</label>
          <input id="x" type="text" />
          <BottomSheetClose>Avbryt</BottomSheetClose>
        </form>
      </BottomSheet>,
    )
    // axe analyzes the entire document since Radix portals to body
    const results = await axe.run(container.ownerDocument.body, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
