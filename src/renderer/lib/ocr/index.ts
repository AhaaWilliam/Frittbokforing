/**
 * OCR-modul för kvitto-extraktion.
 *
 * VS-145a: Pure extraction-funktioner + Tesseract worker-wrapper.
 * UI-integration följer i VS-145b.
 * VS-148: PDF-stöd via PDF.js — pdfFirstPageToBlob pre-konverterar.
 *
 * Begränsningar:
 * - Bilder + PDF (sida 1 av PDF). Multi-page PDF tyst trunkerad.
 * - Confidence-threshold 70% per fält.
 * - Svenska + engelska språkmodell.
 */

import { recognizeReceipt } from './tesseract-worker'
import { pdfFirstPageToBlob } from './pdf-to-blob'
import {
  extractReceiptFields,
  type ExtractedFields,
} from './extract-receipt-fields'

/**
 * Komposition: kör Tesseract på en blob och extrahera fält från resultatet.
 *
 * VS-148: Om input är en PDF (mime-type `application/pdf`) renderas första
 * sidan till en PNG-blob via PDF.js innan Tesseract anropas.
 */
export async function ocrReceipt(blob: Blob): Promise<ExtractedFields> {
  const imageBlob =
    blob && blob.type === 'application/pdf'
      ? await pdfFirstPageToBlob(blob)
      : blob
  const { text, confidence } = await recognizeReceipt(imageBlob)
  return extractReceiptFields(text, confidence)
}

export {
  extractReceiptFields,
  extractAmountKr,
  extractDate,
  extractSupplierHint,
  type ExtractedFields,
  type ExtractedFieldResult,
} from './extract-receipt-fields'
export { pdfFirstPageToBlob } from './pdf-to-blob'
export {
  recognizeReceipt,
  prewarmWorker,
  terminateWorker,
  type OcrRecognitionResult,
} from './tesseract-worker'
export {
  matchSupplier,
  normalizeSupplierName,
  levenshtein,
  type SupplierCandidate,
  type SupplierMatch,
  type MatchSupplierOptions,
} from './match-supplier'
export {
  extractOrgNumber,
  isValidSwedishOrgNumber,
  normalizeOrgNumber,
  type ExtractedOrgNumber,
} from './extract-org-number'
