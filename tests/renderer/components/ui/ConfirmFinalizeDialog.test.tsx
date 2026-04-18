// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ConfirmFinalizeDialog } from '../../../../src/renderer/components/ui/ConfirmFinalizeDialog'

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Bokför verifikation',
  description: 'Verifikation C3 kommer att bokföras.',
  onConfirm: vi.fn(),
  isLoading: false,
}

beforeEach(() => {
  setupMockIpc()
})

describe('ConfirmFinalizeDialog', () => {
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <ConfirmFinalizeDialog {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders title and permanent action warning', async () => {
    await renderWithProviders(
      <ConfirmFinalizeDialog {...DEFAULT_PROPS} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    expect(screen.getByText('Bokför verifikation')).toBeInTheDocument()
    expect(
      screen.getByText(/Denna åtgärd kan inte ångras/),
    ).toBeInTheDocument()
  })

  it('shows loading state when isLoading=true', async () => {
    await renderWithProviders(
      <ConfirmFinalizeDialog {...DEFAULT_PROPS} isLoading={true} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    const confirmBtn = screen.getByRole('button', { name: /Bokför/ })
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn).toHaveTextContent('Bokför...')
  })

  // Sprint P: focus-trap + Escape hanteras av Radix AlertDialog-primitive

  it('focuses cancel button on open', async () => {
    await renderWithProviders(
      <ConfirmFinalizeDialog {...DEFAULT_PROPS} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    const cancelBtn = screen.getByRole('button', { name: 'Avbryt' })
    expect(document.activeElement).toBe(cancelBtn)
  })

  it('Escape closes dialog via onOpenChange(false)', async () => {
    const onOpenChange = vi.fn()
    await renderWithProviders(
      <ConfirmFinalizeDialog {...DEFAULT_PROPS} onOpenChange={onOpenChange} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('Escape blockeras när isLoading=true', async () => {
    const onOpenChange = vi.fn()
    await renderWithProviders(
      <ConfirmFinalizeDialog
        {...DEFAULT_PROPS}
        isLoading={true}
        onOpenChange={onOpenChange}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
