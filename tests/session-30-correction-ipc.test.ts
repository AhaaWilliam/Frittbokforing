import { describe, it, expect } from 'vitest'
import {
  CorrectJournalEntrySchema,
  CanCorrectSchema,
} from '../src/shared/ipc-schemas'

describe('B4: Correction IPC schemas', () => {
  describe('CorrectJournalEntrySchema', () => {
    it('accepts valid input', () => {
      const result = CorrectJournalEntrySchema.safeParse({
        journal_entry_id: 1,
        fiscal_year_id: 1,
      })
      expect(result.success).toBe(true)
    })

    it('rejects missing fields', () => {
      expect(CorrectJournalEntrySchema.safeParse({}).success).toBe(false)
      expect(
        CorrectJournalEntrySchema.safeParse({ journal_entry_id: 1 }).success,
      ).toBe(false)
    })

    it('rejects extra fields (strict)', () => {
      expect(
        CorrectJournalEntrySchema.safeParse({
          journal_entry_id: 1,
          fiscal_year_id: 1,
          extra: true,
        }).success,
      ).toBe(false)
    })

    it('rejects non-positive integers', () => {
      expect(
        CorrectJournalEntrySchema.safeParse({
          journal_entry_id: 0,
          fiscal_year_id: 1,
        }).success,
      ).toBe(false)
      expect(
        CorrectJournalEntrySchema.safeParse({
          journal_entry_id: 1.5,
          fiscal_year_id: 1,
        }).success,
      ).toBe(false)
    })
  })

  describe('CanCorrectSchema', () => {
    it('accepts valid input', () => {
      const result = CanCorrectSchema.safeParse({ journal_entry_id: 42 })
      expect(result.success).toBe(true)
    })

    it('rejects missing field', () => {
      expect(CanCorrectSchema.safeParse({}).success).toBe(false)
    })

    it('rejects extra fields (strict)', () => {
      expect(
        CanCorrectSchema.safeParse({ journal_entry_id: 1, extra: true })
          .success,
      ).toBe(false)
    })
  })
})
