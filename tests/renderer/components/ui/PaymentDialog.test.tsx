// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { PaymentDialog } from '../../../../src/renderer/components/ui/PaymentDialog'

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Betala faktura',
  totalAmount: 10000,
  paidAmount: 0,
  documentDate: '2026-03-15',
  fiscalYearEnd: '2026-12-31',
  onSubmit: vi.fn(),
  isLoading: false,
}

beforeEach(() => {
  setupMockIpc()
})

function renderDialog(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, ...overrides }
  return renderWithProviders(<PaymentDialog {...props} />, { axeCheck: false }) // M133 exempt — dedicated axe test below
}

describe('PaymentDialog', () => {
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <PaymentDialog {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders dialog when open', async () => {
    await renderDialog()
    await waitFor(() => {
      expect(screen.getByText('Betala faktura')).toBeDefined()
    })
  })

  it('does not render when closed', async () => {
    await renderDialog({ open: false })
    expect(screen.queryByText('Betala faktura')).toBeNull()
  })

  it('cancel button closes dialog', async () => {
    const onOpenChange = vi.fn()
    await renderDialog({ onOpenChange })
    await waitFor(() => {
      expect(screen.getByText('Avbryt')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Avbryt'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('loading state disables submit', async () => {
    await renderDialog({ isLoading: true })
    await waitFor(() => {
      const btn = screen.getByText('Registrerar...')
      expect(btn.closest('button')?.disabled).toBe(true)
    })
  })

  it('shows remaining amount breakdown', async () => {
    await renderDialog({ totalAmount: 10000, paidAmount: 3000 })
    await waitFor(() => {
      // 70 kr remaining
      expect(screen.getByText(/70/)).toBeDefined()
    })
  })
})
