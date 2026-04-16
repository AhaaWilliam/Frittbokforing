/**
 * PDF text extraction helper för E2E-tester.
 *
 * Använder pdf-parse (v2+, klass-baserat API). Assertera på innehåll
 * (orgnr, totalbelopp, kundnamn), inte layout — layout får ändras utan
 * test-break.
 */
import fs from 'fs'
import { PDFParse } from 'pdf-parse'

export async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath)
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

/**
 * Sök efter alla strängar i PDF-text. Kastar med lista av saknade strängar.
 */
export async function assertPdfContains(
  filePath: string,
  expected: string[],
): Promise<void> {
  const text = await extractPdfText(filePath)
  const missing = expected.filter((s) => !text.includes(s))
  if (missing.length > 0) {
    throw new Error(
      `PDF vid ${filePath} saknar: ${missing.join(', ')}\n--- faktisk text ---\n${text.slice(0, 500)}`,
    )
  }
}
