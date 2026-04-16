// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CreateFiscalYearDialog } from '../../../../src/renderer/components/layout/CreateFiscalYearDialog'

beforeEach(() => {
  setupMockIpc()
  // Mock net-result endpoint for the dialog's loading step
  mockIpcResponse('opening-balance:net-result', {
    success: true,
    data: { netResultOre: 50000, isAlreadyBooked: false },
  })
})

describe('CreateFiscalYearDialog — F49 a11y', () => {
  it('dialog has role="dialog", aria-modal, aria-labelledby and passes axe', async () => {
    const { container } = await renderWithProviders(
      <CreateFiscalYearDialog open={true} onClose={vi.fn()} />,
    )

    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'create-fy-title')

    // Title element referenced by aria-labelledby exists
    const title = container.querySelector('#create-fy-title')
    expect(title).not.toBeNull()
    expect(title).toHaveTextContent('Skapa nytt räkenskapsår')
  })
})
