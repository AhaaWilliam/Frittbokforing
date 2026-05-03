// @vitest-environment jsdom
/**
 * Sprint VS-145b — OCR-integration i BokforKostnadSheet.
 *
 * Verifierar:
 *  - Image-attach via drop kör ocrReceipt → suggestion-toast visas
 *  - Klick "Tillämpa" pre-fyller fält + stänger toast
 *  - Klick "Avvisa" rör inte fält + stänger toast
 *  - PDF-attach triggar ingen OCR (skip)
 *  - ocrReceipt rejection → tyst, ingen toast, ingen krasch
 *  - ocrReceipt returnerar tomt {} → ingen toast
 *  - supplier_hint visas som extra rad i toast
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'

// Mock ocr-modulen INNAN sheet-import. Default: returnera fixture.
// VS-145c: matchSupplier exporteras också från modulen — re-exportas här
// som no-op (returnera null) för bakåtkompat med VS-145b-fixtures som
// inte testar fuzzy-match.
const ocrReceiptMock = vi.fn()
vi.mock('../../../../src/renderer/lib/ocr', () => ({
  ocrReceipt: (blob: Blob) => ocrReceiptMock(blob),
  matchSupplier: () => null,
  prewarmWorker: () => Promise.resolve(),
}))

// Mock SupplierPicker — minimal stub.
vi.mock(
  '../../../../src/renderer/components/expenses/SupplierPicker',
  () => ({
    SupplierPicker: () => (
      <button type="button" data-testid="supplier-picker-mock">
        Välj
      </button>
    ),
  }),
)

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { BokforKostnadSheet } from '../../../../src/renderer/modes/vardag/BokforKostnadSheet'
import { defaultExpenseVatCodes } from '../../components/__fixtures__/expenses'

beforeEach(() => {
  ocrReceiptMock.mockReset()
  setupMockIpc()
  mockIpcResponse('vat-code:list', {
    success: true,
    data: defaultExpenseVatCodes,
  })
})

function dropFile(zone: Element, name: string, ext: string) {
  const mime =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg'
  const file = Object.assign(new File(['x'], name + ext, { type: mime }), {
    path: '/tmp/' + name + ext,
  })
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
}

describe('Sprint VS-145b — OCR-integration i BokforKostnadSheet', () => {
  it('image-attach via drop kör OCR och visar suggestion', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 2350,
      date: '2026-04-15',
      supplier_hint: 'Acme',
      confidence: 85,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    await waitFor(() => {
      expect(ocrReceiptMock).toHaveBeenCalledTimes(1)
    })
    const callout = await screen.findByTestId('vardag-kostnad-ocr-suggestion')
    expect(callout).toHaveTextContent('2026-04-15')
    expect(callout).toHaveTextContent('2 350 kr')
    expect(
      screen.getByTestId('vardag-kostnad-ocr-supplier-hint'),
    ).toHaveTextContent('Acme')
  })

  it('klick "Tillämpa" pre-fyller fält och stänger suggestion', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 1234.5,
      date: '2026-03-20',
      confidence: 80,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.png')

    const apply = await screen.findByTestId('vardag-kostnad-ocr-apply')
    fireEvent.click(apply)

    expect(
      screen.queryByTestId('vardag-kostnad-ocr-suggestion'),
    ).toBeNull()
    expect(screen.getByTestId('vardag-kostnad-amount')).toHaveValue('1234,50')
    expect(screen.getByTestId('vardag-kostnad-date')).toHaveValue('2026-03-20')
  })

  it('klick "Avvisa" stänger suggestion utan att ändra fält', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 999,
      date: '2026-01-01',
      confidence: 75,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    const amountBefore = (
      screen.getByTestId('vardag-kostnad-amount') as HTMLInputElement
    ).value
    dropFile(zone, 'kvitto', '.webp')

    const dismiss = await screen.findByTestId('vardag-kostnad-ocr-dismiss')
    fireEvent.click(dismiss)

    expect(
      screen.queryByTestId('vardag-kostnad-ocr-suggestion'),
    ).toBeNull()
    expect(screen.getByTestId('vardag-kostnad-amount')).toHaveValue(
      amountBefore,
    )
  })

  it('PDF-attach kör OCR (VS-148)', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 500,
      date: '2026-04-01',
      confidence: 80,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.pdf')

    await waitFor(() => {
      expect(ocrReceiptMock).toHaveBeenCalledTimes(1)
    })
    const callout = await screen.findByTestId('vardag-kostnad-ocr-suggestion')
    expect(callout).toHaveTextContent('500 kr')
  })

  it('OCR-rejection logger tyst utan att visa toast', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ocrReceiptMock.mockRejectedValue(new Error('OCR_RECOGNITION_FAILED'))

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled()
    })
    expect(
      screen.queryByTestId('vardag-kostnad-ocr-suggestion'),
    ).toBeNull()
    warnSpy.mockRestore()
  })

  it('OCR returnerar tomt resultat → ingen suggestion', async () => {
    ocrReceiptMock.mockResolvedValue({ confidence: 50 })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropFile(zone, 'kvitto', '.jpg')

    await waitFor(() => {
      expect(ocrReceiptMock).toHaveBeenCalled()
    })
    // Ge React tid att eventuellt rendera
    await new Promise((r) => setTimeout(r, 30))
    expect(
      screen.queryByTestId('vardag-kostnad-ocr-suggestion'),
    ).toBeNull()
  })
})
