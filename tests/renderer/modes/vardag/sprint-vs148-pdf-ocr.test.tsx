// @vitest-environment jsdom
/**
 * Sprint VS-148 — PDF-OCR-stöd i BokforKostnadSheet.
 *
 * Verifierar:
 *  - PDF-drop triggar ocrReceipt-anrop (inte längre skip)
 *  - PDF-render-fail loggas tyst utan toast eller krasch
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'

const ocrReceiptMock = vi.fn()
vi.mock('../../../../src/renderer/lib/ocr', () => ({
  ocrReceipt: (blob: Blob) => ocrReceiptMock(blob),
  matchSupplier: () => null,
  prewarmWorker: () => Promise.resolve(),
}))

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

function dropPdf(zone: Element) {
  const file = Object.assign(
    new File(['%PDF-1.4 mock'], 'kvitto.pdf', { type: 'application/pdf' }),
    { path: '/tmp/kvitto.pdf' },
  )
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
}

describe('Sprint VS-148 — PDF-OCR i BokforKostnadSheet', () => {
  it('drop PDF → ocrReceipt anropas och suggestion visas', async () => {
    ocrReceiptMock.mockResolvedValue({
      amount_kr: 1499,
      date: '2026-04-22',
      confidence: 80,
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropPdf(zone)

    await waitFor(() => {
      expect(ocrReceiptMock).toHaveBeenCalledTimes(1)
    })
    // Verifiera att blobben som skickades till ocrReceipt har PDF-mime
    const passedBlob = ocrReceiptMock.mock.calls[0][0] as Blob
    expect(passedBlob.type).toBe('application/pdf')

    const callout = await screen.findByTestId('vardag-kostnad-ocr-suggestion')
    expect(callout).toHaveTextContent('1 499 kr')
  })

  it('PDF-render fail → ingen toast, ingen krasch', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ocrReceiptMock.mockRejectedValue({
      code: 'PDF_RENDER_FAILED',
      error: 'Kunde inte rendera PDF-sida.',
    })
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    const zone = await screen.findByTestId('vardag-kostnad-receipt-pick')
    dropPdf(zone)

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled()
    })
    expect(
      screen.queryByTestId('vardag-kostnad-ocr-suggestion'),
    ).toBeNull()
    warnSpy.mockRestore()
  })
})
