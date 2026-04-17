// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ConfirmDialog } from '../../../../src/renderer/components/ui/ConfirmDialog'

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Ta bort faktura',
  description: 'Vill du verkligen ta bort denna faktura?',
  onConfirm: vi.fn(),
}

beforeEach(() => {
  setupMockIpc()
})

function renderDialog(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, ...overrides }
  // Reset mocks for each render
  props.onOpenChange = overrides?.onOpenChange ?? vi.fn()
  props.onConfirm = overrides?.onConfirm ?? vi.fn()
  return renderWithProviders(<ConfirmDialog {...props} />, { axeCheck: false }) // M133 exempt — dedicated axe test below
}

describe('ConfirmDialog', () => {
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <ConfirmDialog {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders title and description when open', async () => {
    await renderDialog()
    expect(screen.getByText('Ta bort faktura')).toBeInTheDocument()
    expect(
      screen.getByText('Vill du verkligen ta bort denna faktura?'),
    ).toBeInTheDocument()
  })

  it('renders nothing when open=false', async () => {
    await renderDialog({ open: false })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('variant=danger gives confirm button red background', async () => {
    await renderDialog({ variant: 'danger' } as Partial<typeof DEFAULT_PROPS>)
    const confirmBtn = screen.getByRole('button', { name: 'Bekräfta' })
    expect(confirmBtn.className).toContain('bg-red')
  })

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn()
    await renderDialog({ onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Bekräfta' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onOpenChange(false) when cancel button clicked', async () => {
    const onOpenChange = vi.fn()
    await renderDialog({ onOpenChange })
    await userEvent.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange(false) on Escape key', async () => {
    const onOpenChange = vi.fn()
    await renderDialog({ onOpenChange })
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('focuses cancel button on open (focus-trap entry point)', async () => {
    await renderDialog()
    const cancelBtn = screen.getByRole('button', { name: 'Avbryt' })
    expect(document.activeElement).toBe(cancelBtn)
  })
})
