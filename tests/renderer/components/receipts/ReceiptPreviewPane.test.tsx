// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcPending,
  mockIpcError,
} from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ReceiptPreviewPane } from '../../../../src/renderer/components/receipts/ReceiptPreviewPane'

const URL_PDF = 'file:///tmp/Fritt%20Bokforing/receipts-inbox/a.pdf'
const URL_IMG = 'file:///tmp/Fritt%20Bokforing/receipts-inbox/b.png'

beforeEach(() => {
  setupMockIpc()
})

describe('ReceiptPreviewPane', () => {
  it('null path → renderar inget', async () => {
    const { container } = await renderWithProviders(
      <ReceiptPreviewPane receiptPath={null} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('PDF → iframe med file://-URL', async () => {
    mockIpcResponse('receipt:get-absolute-path', {
      success: true,
      data: { url: URL_PDF },
    })
    await renderWithProviders(
      <ReceiptPreviewPane receiptPath="receipts-inbox/a.pdf" />,
      { axeCheck: false }, // M133 exempt — iframe-attributes triggers false positives in axe
    )
    const iframe = await screen.findByTestId('receipt-preview-iframe')
    expect(iframe.tagName).toBe('IFRAME')
    expect(iframe.getAttribute('src')).toBe(URL_PDF)
    expect(iframe.getAttribute('aria-label')).toContain('PDF')
  })

  it('Bild (png) → img-element', async () => {
    mockIpcResponse('receipt:get-absolute-path', {
      success: true,
      data: { url: URL_IMG },
    })
    await renderWithProviders(
      <ReceiptPreviewPane receiptPath="receipts-inbox/b.png" />,
    )
    const img = await screen.findByTestId('receipt-preview-image')
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe(URL_IMG)
    expect(img.getAttribute('alt')).toBe('Kvitto')
  })

  it.each(['c.JPG', 'd.jpeg', 'e.webp', 'f.heic', 'g.gif'])(
    'Bild-format %s → img-element',
    async (filename) => {
      mockIpcResponse('receipt:get-absolute-path', {
        success: true,
        data: { url: 'file:///x/' + filename },
      })
      await renderWithProviders(
        <ReceiptPreviewPane receiptPath={'receipts-inbox/' + filename} />,
      )
      expect(await screen.findByTestId('receipt-preview-image')).toBeTruthy()
    },
  )

  it('Okänt format (.txt) → fallback, ingen IPC-anrop', async () => {
    await renderWithProviders(
      <ReceiptPreviewPane receiptPath="receipts-inbox/anteckning.txt" />,
    )
    expect(screen.getByTestId('receipt-preview-fallback')).toBeTruthy()
    expect(screen.queryByTestId('receipt-preview-iframe')).toBeNull()
    expect(screen.queryByTestId('receipt-preview-image')).toBeNull()
  })

  it('Loading-state visas medan IPC pending', async () => {
    mockIpcPending('receipt:get-absolute-path')
    await renderWithProviders(
      <ReceiptPreviewPane receiptPath="receipts-inbox/a.pdf" />,
    )
    expect(screen.getByTestId('receipt-preview-loading')).toBeTruthy()
  })

  it('Error-state visas vid IPC-fel', async () => {
    mockIpcError(
      'receipt:get-absolute-path',
      new Error('Kvittofilen kunde inte hittas på disk.'),
    )
    await renderWithProviders(
      <ReceiptPreviewPane receiptPath="receipts-inbox/missing.pdf" />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('receipt-preview-error')).toBeTruthy()
    })
  })
})
