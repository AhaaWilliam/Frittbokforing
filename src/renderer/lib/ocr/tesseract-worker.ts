/**
 * Tesseract.js worker-wrapper för OCR av kvitton.
 *
 * VS-145a: Singleton worker-pattern — skapa lazy vid första anropet,
 * återanvänd för efterföljande recognitions. Cleanup-funktion för tester.
 *
 * Språk: 'swe+eng'. Default Tesseract laddar språkfiler från CDN
 * (tessdata) — fungerar i Electron-renderer eftersom contextIsolation
 * inte blockerar fetch till externa språkfilskällor. För offline-bundling
 * kan tessdata-bundling läggas till senare (out of scope för MVP).
 */

import Tesseract, { type Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise
  workerPromise = (async () => {
    // Tesseract v7 API: createWorker(langs, oem, options)
    const worker = await Tesseract.createWorker('swe+eng')
    return worker
  })()
  return workerPromise
}

export type OcrRecognitionResult = {
  text: string
  confidence: number
}

/**
 * Genomför OCR-igenkänning på en bild-blob. Returnerar raw text och
 * Tesseract-confidence (0-100).
 *
 * Kastar strukturerade fel om bilden inte kan processas.
 */
export async function recognizeReceipt(
  blob: Blob,
): Promise<OcrRecognitionResult> {
  if (!blob || blob.size === 0) {
    throw {
      code: 'OCR_INVALID_INPUT',
      error: 'Ingen bild tillgänglig för OCR.',
    }
  }
  let worker: Worker
  try {
    worker = await getWorker()
  } catch (err) {
    throw {
      code: 'OCR_WORKER_INIT_FAILED',
      error: 'Kunde inte initiera OCR-motor.',
      cause: err,
    }
  }
  try {
    const result = await worker.recognize(blob)
    return {
      text: result.data.text ?? '',
      confidence: result.data.confidence ?? 0,
    }
  } catch (err) {
    throw {
      code: 'OCR_RECOGNITION_FAILED',
      error: 'OCR-bearbetning misslyckades.',
      cause: err,
    }
  }
}

/**
 * Avsluta singleton-workern. Används främst i tester och vid app-shutdown.
 * Idempotent — säkert att kalla även om ingen worker finns.
 */
export async function terminateWorker(): Promise<void> {
  if (!workerPromise) return
  try {
    const worker = await workerPromise
    await worker.terminate()
  } catch {
    // Best-effort cleanup
  } finally {
    workerPromise = null
  }
}
