// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
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
      { axeCheck: false },
    )
    expect(screen.getByText('Bokför verifikation')).toBeInTheDocument()
    expect(
      screen.getByText(/Denna åtgärd kan inte ångras/),
    ).toBeInTheDocument()
  })

  it('shows loading state when isLoading=true', async () => {
    await renderWithProviders(
      <ConfirmFinalizeDialog {...DEFAULT_PROPS} isLoading={true} />,
      { axeCheck: false },
    )
    const confirmBtn = screen.getByRole('button', { name: /Bokför/ })
    expect(confirmBtn).toBeDisabled()
    expect(confirmBtn).toHaveTextContent('Bokför...')
  })
})
