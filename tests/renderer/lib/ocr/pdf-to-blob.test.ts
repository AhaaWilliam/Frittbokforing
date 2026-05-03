// @vitest-environment jsdom
/**
 * VS-148 — pdfFirstPageToBlob unit tests.
 *
 * pdfjs-dist mockas helt; vi verifierar bara att vår wrapper:
 *  - Validerar input (PDF_INVALID på tom blob)
 *  - Anropar getDocument med rätt arrayBuffer
 *  - Hämtar bara sida 1 (multi-page tyst trunkerad)
 *  - Wrappar getDocument-rejection som PDF_RENDER_FAILED
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getPageMock = vi.fn()
const getDocumentMock = vi.fn()

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: (opts: unknown) => getDocumentMock(opts),
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: 'mock-worker.js',
}))

import { pdfFirstPageToBlob } from '../../../../src/renderer/lib/ocr/pdf-to-blob'

function makePageMock() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 100 * scale,
      height: 200 * scale,
    }),
    render: ({ canvas }: { canvas: HTMLCanvasElement }) => ({
      promise: Promise.resolve().then(() => {
        // Simulera rendering — fyll canvas (jsdom har inget ctx-stöd
        // men toBlob mockas ändå nedan)
        void canvas
      }),
    }),
  }
}

beforeEach(() => {
  getPageMock.mockReset()
  getDocumentMock.mockReset()
  // Override toBlob globalt — jsdom returnerar default null.
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(['png-bytes'], { type: 'image/png' }))
  }
  // jsdom har ingen 2D-context — stub getContext.
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}) as CanvasRenderingContext2D,
  ) as never
})

describe('pdfFirstPageToBlob', () => {
  it('happy path: returnerar PNG-blob av sida 1', async () => {
    getPageMock.mockResolvedValue(makePageMock())
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: getPageMock,
      }),
    })
    const pdf = new Blob(['%PDF-1.4 ...'], { type: 'application/pdf' })
    const out = await pdfFirstPageToBlob(pdf)
    expect(out.type).toBe('image/png')
    expect(out.size).toBeGreaterThan(0)
    expect(getPageMock).toHaveBeenCalledTimes(1)
    expect(getPageMock).toHaveBeenCalledWith(1)
  })

  it('multi-page PDF: bara sida 1 hämtas', async () => {
    getPageMock.mockResolvedValue(makePageMock())
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 17,
        getPage: getPageMock,
      }),
    })
    const pdf = new Blob(['%PDF-1.4 ...'], { type: 'application/pdf' })
    await pdfFirstPageToBlob(pdf)
    // Bekräfta att vi inte loopar över alla sidor
    expect(getPageMock).toHaveBeenCalledTimes(1)
    expect(getPageMock).toHaveBeenCalledWith(1)
  })

  it('tom blob → PDF_INVALID', async () => {
    const pdf = new Blob([], { type: 'application/pdf' })
    await expect(pdfFirstPageToBlob(pdf)).rejects.toMatchObject({
      code: 'PDF_INVALID',
    })
    expect(getDocumentMock).not.toHaveBeenCalled()
  })

  it('getDocument rejection → PDF_RENDER_FAILED', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure')),
    })
    const pdf = new Blob(['not-a-pdf'], { type: 'application/pdf' })
    await expect(pdfFirstPageToBlob(pdf)).rejects.toMatchObject({
      code: 'PDF_RENDER_FAILED',
    })
  })
})
