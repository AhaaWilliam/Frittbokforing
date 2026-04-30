// @vitest-environment jsdom
/**
 * Sprint 45 — InvoiceForm + ConsequencePane wire-in (paritet med S18 manual).
 *
 * Verifierar att InvoiceForm renderar ConsequencePane i höger-zon med
 * data-testid="invoice-consequence" samt att den startar i idle state.
 * Speglar mönstret från ManualEntryForm.preview.test.tsx (Sprint 18).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceForm } from '../../../../src/renderer/components/invoices/InvoiceForm'
import type { VatCode } from '../../../../src/shared/types'

vi.mock('../../../../src/renderer/components/invoices/CustomerPicker', () => ({
  CustomerPicker: () => <div data-testid="picker-stub" />,
}))
vi.mock('../../../../src/renderer/components/invoices/InvoiceLineRow', () => ({
  InvoiceLineRow: () => <tr data-testid="line-row-stub" />,
}))
vi.mock('../../../../src/renderer/components/invoices/InvoiceTotals', () => ({
  InvoiceTotals: () => <div data-testid="totals-stub" />,
}))

const defaultVatCodes: VatCode[] = [
  {
    id: 1,
    code: '25',
    description: 'Moms 25%',
    rate_percent: 25,
    vat_type: 'outgoing',
    report_box: null,
  },
]

describe('InvoiceForm — ConsequencePane wire-in (Sprint 45)', () => {
  beforeEach(() => {
    setupMockIpc()
    mockIpcResponse('vat-code:list', { success: true, data: defaultVatCodes })
    mockIpcResponse('invoice:next-number', {
      success: true,
      data: { preview: 1001 },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renderar ConsequencePane med data-testid="invoice-consequence"', async () => {
    await renderWithProviders(
      <InvoiceForm
        fiscalYearId={1}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByTestId('invoice-consequence')).toBeInTheDocument()
  })

  it('startar i idle state när inga rader finns', async () => {
    await renderWithProviders(
      <InvoiceForm
        fiscalYearId={1}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByTestId('consequence-pane-idle')).toBeInTheDocument()
  })
})
