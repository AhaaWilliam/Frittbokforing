// @vitest-environment jsdom
/**
 * Sprint VS-152 — Skapa ny leverantör från OCR-hint.
 *
 * Verifierar:
 *  - OCR-hint utan match → "Skapa ..."-knapp synlig
 *  - OCR-hint med match → knappen INTE synlig
 *  - Klick → createCounterparty anropas med hint-namn + org_number (om OCR
 *    hittat) + type='supplier' + company_id
 *  - Lyckad create → supplier-state pre-fyllt + toast.success + dismiss av
 *    suggestion
 *  - Duplicate-fel (M124-strukturerat) → toast.error visas, callout kvar
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { defaultExpenseVatCodes } from '../../components/__fixtures__/expenses'
import {
  supplierFixtures,
  makeCounterparty,
} from '../../components/__fixtures__/counterparties'
import { toast } from 'sonner'

const ocrReceiptMock = vi.fn()
vi.mock('../../../../src/renderer/lib/ocr', async () => {
  const real = await vi.importActual<
    typeof import('../../../../src/renderer/lib/ocr')
  >('../../../../src/renderer/lib/ocr')
  return {
    ...real,
    ocrReceipt: (blob: Blob) => ocrReceiptMock(blob),
  }
})

vi.mock('../../../../src/renderer/components/expenses/SupplierPicker', () => ({
  SupplierPicker: ({
    value,
  }: {
    value: { id: number; name: string } | null
  }) => (
    <div data-testid="supplier-picker-mock" data-value-id={value?.id ?? ''}>
      {value ? value.name : 'Välj'}
    </div>
  ),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { BokforKostnadSheet } from '../../../../src/renderer/modes/vardag/BokforKostnadSheet'

type MockApi = Record<string, ReturnType<typeof vi.fn>>
function getMockApi(): MockApi {
  return (window as unknown as { api: MockApi }).api
}

beforeEach(() => {
  ocrReceiptMock.mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.warning).mockReset()
  setupMockIpc()
  mockIpcResponse('vat-code:list', {
    success: true,
    data: defaultExpenseVatCodes,
  })
  mockIpcResponse('counterparty:list', {
    success: true,
    data: supplierFixtures,
  })
})

function dropFile(zone: Element, name: string, ext: string) {
  const file = Object.assign(new File(['x'], name + ext), {
    path: '/tmp/' + name + ext,
  })
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
}

describe('Sprint VS-152 — Skapa leverantör från OCR-hint', () => {
  it('hint utan match → "Skapa ..."-knapp synlig', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 500,
      date: '2026-04-15',
      supplier_hint: 'Helt Okänt Företag XYZ',
      confidence: 85,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toBeInTheDocument()
    })

    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    const btn = await screen.findByTestId('vardag-kostnad-ocr-create-supplier')
    expect(btn).toHaveTextContent(
      'Skapa "Helt Okänt Företag XYZ" som leverantör',
    )
  })

  it('hint MED match → "Skapa ..."-knapp INTE synlig', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 500,
      date: '2026-04-15',
      supplier_hint: 'Leverantör Ett',
      confidence: 85,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toBeInTheDocument()
    })

    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    await screen.findByTestId('vardag-kostnad-ocr-supplier-match')
    expect(
      screen.queryByTestId('vardag-kostnad-ocr-create-supplier'),
    ).toBeNull()
  })

  it('klick → createCounterparty anropas med hint + org_number + type=supplier', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 500,
      date: '2026-04-15',
      supplier_hint: 'Nytt Bolag AB',
      org_number: '559988-7766',
      confidence: 85,
    })
    const created = makeCounterparty({
      id: 555,
      name: 'Nytt Bolag AB',
      type: 'supplier',
      org_number: '559988-7766',
    })
    mockIpcResponse('counterparty:create', { success: true, data: created })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toBeInTheDocument()
    })

    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    const btn = await screen.findByTestId('vardag-kostnad-ocr-create-supplier')
    fireEvent.click(btn)

    await waitFor(() => {
      expect(getMockApi().createCounterparty).toHaveBeenCalledTimes(1)
    })
    const arg = getMockApi().createCounterparty.mock.calls[0][0]
    expect(arg).toMatchObject({
      name: 'Nytt Bolag AB',
      type: 'supplier',
      org_number: '559988-7766',
    })
    expect(typeof arg.company_id).toBe('number')
  })

  it('lyckad create → supplier pre-fyllt + toast.success + suggestion stängd', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 500,
      date: '2026-04-15',
      supplier_hint: 'Nytt Bolag AB',
      confidence: 85,
    })
    const created = makeCounterparty({
      id: 555,
      name: 'Nytt Bolag AB',
      type: 'supplier',
    })
    mockIpcResponse('counterparty:create', { success: true, data: created })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toBeInTheDocument()
    })

    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    const btn = await screen.findByTestId('vardag-kostnad-ocr-create-supplier')
    fireEvent.click(btn)

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toHaveAttribute(
        'data-value-id',
        '555',
      )
    })
    expect(toast.success).toHaveBeenCalledWith(
      "Skapade leverantör 'Nytt Bolag AB'",
    )
    expect(screen.queryByTestId('vardag-kostnad-ocr-suggestion')).toBeNull()
  })

  it('duplicate-fel → toast.error + callout kvar öppen', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 500,
      date: '2026-04-15',
      supplier_hint: 'Dublett AB',
      org_number: '556677-8899',
      confidence: 85,
    })
    mockIpcResponse('counterparty:create', {
      success: false,
      code: 'DUPLICATE_ORG_NUMBER',
      error: 'En motpart med detta organisationsnummer finns redan.',
      field: 'org_number',
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toBeInTheDocument()
    })

    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    const btn = await screen.findByTestId('vardag-kostnad-ocr-create-supplier')
    fireEvent.click(btn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'En motpart med detta organisationsnummer finns redan.',
      )
    })
    // Callout kvar öppen så användaren kan välja annat.
    expect(
      screen.getByTestId('vardag-kostnad-ocr-suggestion'),
    ).toBeInTheDocument()
    // Supplier oförändrad.
    expect(screen.getByTestId('supplier-picker-mock')).toHaveAttribute(
      'data-value-id',
      '',
    )
  })
})
