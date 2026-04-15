import { describe, it, expect } from 'vitest'
import { calculateManualEntryTotals, formatDiffLabel } from '../../../src/renderer/lib/manual-entry-calcs'
import type { ManualEntryLineForm } from '../../../src/renderer/lib/form-schemas/manual-entry'

function makeLine(debitKr: string, creditKr: string): ManualEntryLineForm {
  return { key: 'k', accountNumber: '1910', debitKr, creditKr, description: '' }
}

describe('calculateManualEntryTotals', () => {
  it('tom array → allt noll', () => {
    const result = calculateManualEntryTotals([])
    expect(result).toEqual({ totalDebit: 0, totalCredit: 0, diff: 0 })
  })

  it('balanserad → diff === 0', () => {
    const lines = [makeLine('500', ''), makeLine('', '500')]
    const result = calculateManualEntryTotals(lines)
    expect(result.totalDebit).toBe(50000)
    expect(result.totalCredit).toBe(50000)
    expect(result.diff).toBe(0)
  })

  it('debet-tung → diff > 0 (öre)', () => {
    const lines = [makeLine('1000', ''), makeLine('', '500')]
    const result = calculateManualEntryTotals(lines)
    expect(result.diff).toBe(50000) // 1000 - 500 = 500 kr = 50000 öre
  })

  it('kredit-tung → diff < 0 (öre)', () => {
    const lines = [makeLine('200', ''), makeLine('', '700')]
    const result = calculateManualEntryTotals(lines)
    expect(result.diff).toBe(-50000) // 200 - 700 = -500 kr = -50000 öre
  })
})

describe('formatDiffLabel', () => {
  it('diff=0 → balanced true, tom text', () => {
    expect(formatDiffLabel(0)).toEqual({ text: '', balanced: true })
  })

  it('diff > 0 → debet > kredit', () => {
    expect(formatDiffLabel(50000)).toEqual({ text: 'debet > kredit', balanced: false })
  })

  it('diff < 0 → kredit > debet', () => {
    expect(formatDiffLabel(-50000)).toEqual({ text: 'kredit > debet', balanced: false })
  })
})
