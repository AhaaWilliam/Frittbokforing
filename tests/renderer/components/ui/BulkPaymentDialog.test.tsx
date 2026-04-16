// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { BulkPaymentDialog } from '../../../../src/renderer/components/ui/BulkPaymentDialog'
import type { BulkPaymentRow } from '../../../../src/renderer/components/ui/BulkPaymentDialog'

const ROWS: BulkPaymentRow[] = [
  { id: 1, label: '#001', counterparty: 'Kund A', remaining: 10000 },
  { id: 2, label: '#002', counterparty: 'Kund B', remaining: 20000 },
  { id: 3, label: '#003', counterparty: 'Kund C', remaining: 5000 },
]

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Bulkbetalning',
  rows: ROWS,
  onSubmit: vi.fn(),
  isLoading: false,
}

beforeEach(() => {
  setupMockIpc()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
})

function renderDialog(overrides?: Partial<typeof DEFAULT_PROPS>, axeCheck = false) {
  const props = { ...DEFAULT_PROPS, ...overrides }
  return renderWithProviders(<BulkPaymentDialog {...props} />, { axeCheck })
}

describe('BulkPaymentDialog', () => {
  // Axe test first to avoid "already running" race
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <BulkPaymentDialog {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders table with all rows', async () => {
    await renderDialog()
    await waitFor(() => {
      expect(screen.getByText('Kund A')).toBeDefined()
      expect(screen.getByText('Kund B')).toBeDefined()
      expect(screen.getByText('Kund C')).toBeDefined()
    })
  })

  it('does not render when closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByText('Bulkbetalning')).toBeNull()
  })

  it('does not render when rows empty', () => {
    renderDialog({ rows: [] })
    expect(screen.queryByText('Bulkbetalning')).toBeNull()
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

  it('submit button disabled when loading', async () => {
    await renderDialog({ isLoading: true })
    await waitFor(() => {
      const btn = screen.getByText('Bearbetar...')
      expect(btn.closest('button')?.disabled).toBe(true)
    })
  })
})
