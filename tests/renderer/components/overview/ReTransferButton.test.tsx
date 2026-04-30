// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ReTransferButton } from '../../../../src/renderer/components/overview/ReTransferButton'

beforeEach(() => {
  setupMockIpc()
})

describe('ReTransferButton', () => {
  it('default visar trigger-knapp, inte confirm', async () => {
    await renderWithProviders(<ReTransferButton />)
    expect(
      screen.getByRole('button', { name: /Uppdatera ingående balanser/ }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('re-transfer-confirm')).not.toBeInTheDocument()
  })

  it('klick på trigger öppnar confirm-callout', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<ReTransferButton />)
    await user.click(
      screen.getByRole('button', { name: /Uppdatera ingående balanser/ }),
    )
    expect(screen.getByTestId('re-transfer-confirm')).toBeInTheDocument()
    expect(screen.getByText(/Befintlig IB \(O1\) ersätts/)).toBeInTheDocument()
  })

  it('Avbryt-knapp stänger confirm', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<ReTransferButton />)
    await user.click(screen.getByRole('button', { name: /Uppdatera ingående/ }))
    await user.click(screen.getByRole('button', { name: /Avbryt/ }))
    expect(screen.queryByTestId('re-transfer-confirm')).not.toBeInTheDocument()
  })

  it('Uppdatera-knapp anropar IPC och stänger confirm vid success', async () => {
    const user = userEvent.setup()
    mockIpcResponse('opening-balance:re-transfer', { success: true, data: null })
    await renderWithProviders(<ReTransferButton />)
    await user.click(screen.getByRole('button', { name: /Uppdatera ingående/ }))
    await user.click(screen.getByRole('button', { name: /^Uppdatera$/ }))
    // Confirm-callout försvinner när mutation succeeds
    await screen.findByRole('button', { name: /Uppdatera ingående balanser/ })
    expect(screen.queryByTestId('re-transfer-confirm')).not.toBeInTheDocument()
  })
})
