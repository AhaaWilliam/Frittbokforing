import { describe, it, expect } from 'vitest'
import {
  ManualEntryFormStateSchema,
  parseSwedishAmount,
  makeEmptyManualLine,
  makeManualEntryDefaults,
  transformManualEntryForm,
} from '../../../../src/renderer/lib/form-schemas/manual-entry'

describe('parseSwedishAmount', () => {
  it('tom sträng → 0', () => {
    expect(parseSwedishAmount('')).toBe(0)
    expect(parseSwedishAmount('   ')).toBe(0)
  })

  it('heltal "100" → 10000 öre', () => {
    expect(parseSwedishAmount('100')).toBe(10000)
  })

  it('decimal med komma "12,50" → 1250 öre', () => {
    expect(parseSwedishAmount('12,50')).toBe(1250)
  })

  it('decimal med punkt "12.50" → 1250 öre', () => {
    expect(parseSwedishAmount('12.50')).toBe(1250)
  })

  it('mellanslag som tusentalsavskiljare "1 000" → 100000 öre', () => {
    expect(parseSwedishAmount('1 000')).toBe(100000)
  })

  it('text-skräp → 0', () => {
    expect(parseSwedishAmount('abc')).toBe(0)
  })

  it('avrundar korrekt', () => {
    expect(parseSwedishAmount('1.234')).toBe(123)
    expect(parseSwedishAmount('1.235')).toBe(124)
  })
})

describe('makeEmptyManualLine', () => {
  it('returnerar rad med unik key och tomma fält', () => {
    const a = makeEmptyManualLine()
    const b = makeEmptyManualLine()
    expect(a.key).not.toBe(b.key)
    expect(a.accountNumber).toBe('')
    expect(a.debitKr).toBe('')
    expect(a.creditKr).toBe('')
  })
})

describe('makeManualEntryDefaults', () => {
  it('factory ger 3 tomma rader med unika keys', () => {
    const d = makeManualEntryDefaults()
    expect(d.lines).toHaveLength(3)
    const keys = new Set(d.lines.map((l) => l.key))
    expect(keys.size).toBe(3)
  })

  it('varje anrop ger nya keys (factory, inte konstant)', () => {
    const a = makeManualEntryDefaults()
    const b = makeManualEntryDefaults()
    expect(a.lines[0]?.key).not.toBe(b.lines[0]?.key)
  })
})

describe('ManualEntryFormStateSchema', () => {
  it('giltig form med rader passerar', () => {
    const r = ManualEntryFormStateSchema.safeParse(makeManualEntryDefaults())
    // entryDate='' → fel
    expect(r.success).toBe(false)
  })

  it('entryDate krävs', () => {
    const f = makeManualEntryDefaults()
    const r = ManualEntryFormStateSchema.safeParse({ ...f, entryDate: '' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'Välj datum')).toBe(true)
    }
  })

  it('lines.length=0 → fel', () => {
    const r = ManualEntryFormStateSchema.safeParse({
      entryDate: '2026-04-15',
      description: '',
      lines: [],
    })
    expect(r.success).toBe(false)
  })
})

describe('transformManualEntryForm', () => {
  it('filtrerar bort tomma rader (utan account eller belopp)', () => {
    const form = {
      ...makeManualEntryDefaults(),
      entryDate: '2026-04-15',
      description: 'Test',
      lines: [
        {
          key: 'a',
          accountNumber: '1930',
          debitKr: '100',
          creditKr: '',
          description: 'd',
        },
        {
          key: 'b',
          accountNumber: '',
          debitKr: '',
          creditKr: '',
          description: '',
        },
        {
          key: 'c',
          accountNumber: '6230',
          debitKr: '',
          creditKr: '100',
          description: '',
        },
      ],
    }
    const out = transformManualEntryForm(form, 99)
    expect(out.lines).toHaveLength(2)
    expect(out.fiscal_year_id).toBe(99)
  })

  it('konverterar belopp till öre', () => {
    const form = {
      ...makeManualEntryDefaults(),
      entryDate: '2026-04-15',
      description: '',
      lines: [
        {
          key: 'a',
          accountNumber: '1930',
          debitKr: '125,50',
          creditKr: '',
          description: '',
        },
      ],
    }
    const out = transformManualEntryForm(form, 1)
    expect(out.lines[0]?.debit_ore).toBe(12550)
    expect(out.lines[0]?.credit_ore).toBe(0)
  })

  it('description blir undefined när tomt', () => {
    const form = {
      ...makeManualEntryDefaults(),
      entryDate: '2026-04-15',
      description: '',
      lines: [
        {
          key: 'a',
          accountNumber: '1930',
          debitKr: '100',
          creditKr: '',
          description: '',
        },
      ],
    }
    const out = transformManualEntryForm(form, 1)
    expect(out.lines[0]?.description).toBeUndefined()
  })
})
