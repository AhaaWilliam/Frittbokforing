// @vitest-environment jsdom
/**
 * Sprint VS-145c — counterparty fuzzy-match från OCR supplier_hint.
 *
 * Verifierar:
 *  - OCR-hint som matchar existerande supplier → toast visar "Förslag på
 *    leverantör: {namn}" + Tillämpa pre-fyller counterparty-fältet.
 *  - OCR-hint utan match → toast visar inget supplier-match-element
 *    (bara raw hint).
 *  - Tillämpa utan supplier-match → counterparty-state oförändrad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { defaultExpenseVatCodes } from '../../components/__fixtures__/expenses'
import { supplierFixtures } from '../../components/__fixtures__/counterparties'

const ocrReceiptMock = vi.fn()
vi.mock('../../../../src/renderer/lib/ocr', async () => {
  // Behåll matchSupplier-export real — bara ocrReceipt mockas.
  const real = await vi.importActual<
    typeof import('../../../../src/renderer/lib/ocr')
  >('../../../../src/renderer/lib/ocr')
  return {
    ...real,
    ocrReceipt: (blob: Blob) => ocrReceiptMock(blob),
  }
})

// SupplierPicker-mock som speglar value via test-id för assertion.
vi.mock(
  '../../../../src/renderer/components/expenses/SupplierPicker',
  () => ({
    SupplierPicker: ({
      value,
    }: {
      value: { id: number; name: string } | null
    }) => (
      <div data-testid="supplier-picker-mock" data-value-id={value?.id ?? ''}>
        {value ? value.name : 'Välj'}
      </div>
    ),
  }),
)

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { BokforKostnadSheet } from '../../../../src/renderer/modes/vardag/BokforKostnadSheet'

beforeEach(() => {
  ocrReceiptMock.mockReset()
  setupMockIpc()
  mockIpcResponse('vat-code:list', {
    success: true,
    data: defaultExpenseVatCodes,
  })
  // Suppliers-lista för fuzzy-match. id=3 "Leverantör Ett AB",
  // id=4 "Leverantör Två AB".
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

describe('Sprint VS-145c — supplier fuzzy-match från OCR-hint', () => {
  it('hint som matchar existerande supplier → match-rad + Tillämpa sätter counterparty', async () => {
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

    // Vänta tills suppliers laddats så fuzzy-match har data.
    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toBeInTheDocument()
    })

    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    const matchEl = await screen.findByTestId(
      'vardag-kostnad-ocr-supplier-match',
    )
    expect(matchEl).toHaveTextContent('Leverantör Ett AB')

    // Klick "Tillämpa" — counterparty ska vara satt.
    fireEvent.click(screen.getByTestId('vardag-kostnad-ocr-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toHaveAttribute(
        'data-value-id',
        '3',
      )
    })
  })

  it('hint utan match → ingen supplier-match-rad (bara raw hint)', async () => {
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
    dropFile(zone, 'kvitto', '.png')

    // Vänta på Callout (innehåller belopp/datum), kontrollera sedan att
    // match-elementet INTE finns men att raw hint visas.
    await screen.findByTestId('vardag-kostnad-ocr-suggestion')
    expect(
      screen.queryByTestId('vardag-kostnad-ocr-supplier-match'),
    ).toBeNull()
    expect(screen.getByTestId('vardag-kostnad-ocr-supplier-hint')).toHaveTextContent(
      'Helt Okänt Företag XYZ',
    )
  })

  it('Tillämpa utan supplier-match → counterparty oförändrad', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 500,
      date: '2026-04-15',
      // Ingen supplier_hint alls.
      confidence: 85,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )

    await waitFor(() => {
      expect(screen.getByTestId('supplier-picker-mock')).toBeInTheDocument()
    })

    const before = screen
      .getByTestId('supplier-picker-mock')
      .getAttribute('data-value-id')
    expect(before).toBe('') // ingen supplier vald initialt

    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    const apply = await screen.findByTestId('vardag-kostnad-ocr-apply')
    fireEvent.click(apply)

    // Supplier ska fortfarande vara tomt.
    expect(screen.getByTestId('supplier-picker-mock')).toHaveAttribute(
      'data-value-id',
      '',
    )
  })
})
