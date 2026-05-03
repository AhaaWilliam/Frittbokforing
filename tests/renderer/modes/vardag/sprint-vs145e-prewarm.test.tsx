// @vitest-environment jsdom
/**
 * Sprint VS-145e — pre-warm Tesseract-worker vid sheet-open.
 *
 * Verifierar:
 *  - BokforKostnadSheet mount → prewarmWorker anropas
 *  - Multipla open/close → prewarmWorker kallas vid varje mount
 *    (workern själv är idempotent via singleton — verifieras i
 *    prewarm-worker.test.ts)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'

const prewarmWorkerMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../src/renderer/lib/ocr', () => ({
  ocrReceipt: vi.fn(),
  matchSupplier: () => null,
  prewarmWorker: () => prewarmWorkerMock(),
  // VS-145d helper också re-exporterad från modulen.
  normalizeOrgNumber: (s: string | null | undefined) => s ?? null,
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
  prewarmWorkerMock.mockClear()
  setupMockIpc()
  mockIpcResponse('vat-code:list', {
    success: true,
    data: defaultExpenseVatCodes,
  })
})

describe('Sprint VS-145e — prewarmWorker mount-effekt', () => {
  it('BokforKostnadSheet mount → prewarmWorker anropas (fire-and-forget)', async () => {
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    await waitFor(() => {
      expect(prewarmWorkerMock).toHaveBeenCalledTimes(1)
    })
  })

  it('multipla mounts triggar prewarm vid varje mount (idempotens hanteras i workern)', async () => {
    const first = await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    await waitFor(() => {
      expect(prewarmWorkerMock).toHaveBeenCalledTimes(1)
    })
    first.unmount()

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — covered by Sheets.a11y.test.tsx
    )
    await waitFor(() => {
      expect(prewarmWorkerMock).toHaveBeenCalledTimes(2)
    })
  })
})
