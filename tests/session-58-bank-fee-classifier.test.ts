import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  classifyBankFeeTx,
  invalidateClassifierCache,
  type BankTxInput,
} from '../src/main/services/bank/bank-fee-classifier'

function tx(overrides: Partial<BankTxInput> = {}): BankTxInput {
  return {
    amount_ore: 0,
    counterparty_name: null,
    remittance_info: null,
    bank_tx_domain: null,
    bank_tx_family: null,
    bank_tx_subfamily: null,
    ...overrides,
  }
}

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  invalidateClassifierCache(db)
  db.close()
})

describe('S58 A3 — bank-fee-classifier', () => {
  it('1. CHRG + negativ amount → bank_fee HIGH, konto 6570, B-serie', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'CHRG',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('bank_fee')
    expect(c!.account).toBe('6570')
    expect(c!.series).toBe('B')
    expect(c!.confidence).toBe('HIGH')
    expect(c!.score).toBe(100)
    expect(c!.method).toBe('auto_fee')
  })

  it('2. INTR + positiv amount → interest_income HIGH, 8310, A-serie', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: 10000,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'INTR',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('interest_income')
    expect(c!.account).toBe('8310')
    expect(c!.series).toBe('A')
    expect(c!.confidence).toBe('HIGH')
    expect(c!.method).toBe('auto_interest_income')
  })

  it('3. INTR + negativ amount → interest_expense HIGH, 8410, B-serie', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -20000,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'INTR',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('interest_expense')
    expect(c!.account).toBe('8410')
    expect(c!.series).toBe('B')
    expect(c!.confidence).toBe('HIGH')
    expect(c!.method).toBe('auto_interest_expense')
  })

  it("4. Ingen BkTxCd, text='Månadsavgift', bank-counterparty + fee-text → bank_fee HIGH", () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        counterparty_name: 'SEB',
        remittance_info: 'Månadsavgift',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('bank_fee')
    expect(c!.confidence).toBe('MEDIUM')
    expect(c!.score).toBe(70)
  })

  it('5. Ingen BkTxCd, bank-counterparty + ränte-text, positivt belopp → interest_income MEDIUM', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: 20000,
        counterparty_name: 'SEB',
        remittance_info: 'Ränta mars',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('interest_income')
    expect(c!.confidence).toBe('MEDIUM')
    expect(c!.score).toBe(70)
    expect(c!.method).toBe('auto_interest_income')
  })

  it('6. Normal kundbetalning (ingen bank, ingen text) → null', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: 250000,
        counterparty_name: 'ACME AB',
        remittance_info: 'Faktura 2026-001',
      }),
    )
    expect(c).toBeNull()
  })

  it('7. CHRG + stort belopp (15 000 kr) → fortfarande HIGH (BkTxCd bypass:ar tröskel)', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -1_500_000,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'CHRG',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('bank_fee')
    expect(c!.confidence).toBe('HIGH')
  })

  it('8. Ingen BkTxCd + text-match + stort belopp (över tröskel) → null', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5_000_000,
        counterparty_name: 'SEB',
        remittance_info: 'Stor avgift',
      }),
    )
    expect(c).toBeNull()
  })

  it('9. Determinism: 1000 iterationer av identisk input → identiskt output', () => {
    const input = tx({
      amount_ore: -5000,
      bank_tx_domain: 'PMNT',
      bank_tx_family: 'CCRD',
      bank_tx_subfamily: 'CHRG',
    })
    const first = JSON.stringify(classifyBankFeeTx(db, input))
    for (let i = 0; i < 1000; i++) {
      expect(JSON.stringify(classifyBankFeeTx(db, input))).toBe(first)
    }
  })

  it('10. M153: source-scanning bevisar inga icke-deterministiska tokens', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const src = await fs.readFile(
      path.resolve(
        __dirname,
        '../src/main/services/bank/bank-fee-classifier.ts',
      ),
      'utf8',
    )
    const stripped = src
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""')
    expect(stripped).not.toMatch(/\bDate\.now\b/)
    expect(stripped).not.toMatch(/\bMath\.random\b/)
    expect(stripped).not.toMatch(/\bperformance\.now\b/)
    expect(stripped).not.toMatch(/\bnew Date\b/)
  })
})
