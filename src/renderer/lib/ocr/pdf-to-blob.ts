/**
 * VS-148: PDF → image-blob konverter via PDF.js.
 *
 * Renderar första sidan av en PDF till en PNG-blob i full upplösning
 * (scale 2.0) som sedan kan skickas in i samma OCR-pipeline som bilder.
 *
 * Begränsningar:
 *  - Bara första sidan. Multi-page PDF tyst trunkeras till sida 1.
 *  - PDF.js laddas via dynamic import — bundle-impact (~2-3 MB) defereras
 *    till första PDF-droppen och pulls inte in DOMMatrix-beroenden i
 *    Node-baserade jsdom-tester som inte själva använder PDF.js.
 *  - Worker-bundling sker via Vite ?url-import (renderer-only).
 */

type PdfjsLib = typeof import('pdfjs-dist')

let pdfjsLibPromise: Promise<PdfjsLib> | null = null

async function getPdfjsLib(): Promise<PdfjsLib> {
  if (pdfjsLibPromise) return pdfjsLibPromise
  pdfjsLibPromise = (async () => {
    const pdfjsLib = await import('pdfjs-dist')
    try {
      // Vite-only: ?url-suffixet packar workern som separat asset och
      // returnerar dess publika URL. I jsdom/Node-tester finns ingen
      // ?url-resolver — då skipas worker-konfig (mocket pdfjsLib används).
      const workerMod = (await import(
        // @ts-expect-error — Vite-suffix saknar typer
        'pdfjs-dist/build/pdf.worker.min.mjs?url'
      )) as { default: string }
      if (workerMod && typeof workerMod.default === 'string') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default
      }
    } catch {
      // Best-effort — i tester kommer pdfjsLib mockas helt.
    }
    return pdfjsLib
  })()
  return pdfjsLibPromise
}

/**
 * Render första sidan av en PDF-blob till en PNG-blob i scale 2.0.
 * Tesseract gillar hög upplösning för bra OCR-resultat.
 *
 * Kastar strukturerade fel (`PDF_INVALID`, `PDF_RENDER_FAILED`) som
 * fångas tyst av BokforKostnadSheet (samma policy som OCR-fel).
 */
export async function pdfFirstPageToBlob(pdfBlob: Blob): Promise<Blob> {
  if (!pdfBlob || pdfBlob.size === 0) {
    throw {
      code: 'PDF_INVALID',
      error: 'Ingen PDF-data tillgänglig.',
    }
  }
  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await pdfBlob.arrayBuffer()
  } catch (err) {
    throw {
      code: 'PDF_INVALID',
      error: 'Kunde inte läsa PDF-data.',
      cause: err,
    }
  }
  try {
    const pdfjsLib = await getPdfjsLib()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    // Bara sida 1 — multi-page tyst trunkerad.
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 2.0 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Kunde inte skapa 2D-canvas-context.')
    }
    await page.render({ canvasContext: ctx, viewport, canvas }).promise

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('canvas.toBlob returnerade null.'))
      }, 'image/png')
    })
    return blob
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) throw err
    throw {
      code: 'PDF_RENDER_FAILED',
      error: 'Kunde inte rendera PDF-sida.',
      cause: err,
    }
  }
}
