/**
 * OCR-modul för kvitto-extraktion.
 *
 * VS-145a: Pure extraction-funktioner + Tesseract worker-wrapper.
 * UI-integration följer i VS-145b.
 *
 * Begränsningar:
 * - Bara bilder i v1 (PDF skip — backlog).
 * - Confidence-threshold 70% per fält.
 * - Svenska + engelska språkmodell.
 */

import { recognizeReceipt } from './tesseract-worker'
import {
  extractReceiptFields,
  type ExtractedFields,
} from './extract-receipt-fields'

/**
 * Komposition: kör Tesseract på en blob och extrahera fält från resultatet.
 */
export async function ocrReceipt(blob: Blob): Promise<ExtractedFields> {
  const { text, confidence } = await recognizeReceipt(blob)
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
export {
  recognizeReceipt,
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
