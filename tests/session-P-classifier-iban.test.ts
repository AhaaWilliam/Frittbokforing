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
    counterparty_iban: null,
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
  invalidateClassifierCache(db)
})

afterEach(() => {
  invalidateClassifierCache(db)
  db.close()
})

describe('Sprint P — classifier IBAN-integration', () => {
  it('TX med bank-IBAN utan counterparty_name → bank-bonus + fee-text gör MEDIUM', () => {
    const result = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        counterparty_name: null,
        counterparty_iban: 'SE45 5000 0000 0000 0000 0001', // SEB
        remittance_info: 'Månadsavgift',
      }),
    )
    expect(result).not.toBeNull()
    expect(result?.type).toBe('bank_fee')
    expect(result?.reasons).toContain('IBAN-prefix matchar svensk bank')
  })

  it('TX med utländsk IBAN → ingen IBAN-bonus', () => {
    const result = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        counterparty_name: null,
        counterparty_iban: 'NO9386011117947',
        remittance_info: 'Månadsavgift',
      }),
    )
    // Utan bank-signal + bara fee-text (40) < MEDIUM (50) → null
    expect(result).toBeNull()
  })

  it('TX med både bank-IBAN och bank-name → endast en +30 bonus', () => {
    const result = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        counterparty_name: 'SEB',
        counterparty_iban: 'SE45 5000 0000 0000 0000 0001',
        remittance_info: 'Avgift',
      }),
    )
    expect(result).not.toBeNull()
    expect(result?.type).toBe('bank_fee')
    // Score 70: +30 bank (from OR) +40 fee = 70, >= MEDIUM (50)
    // Bonuser slås INTE ihop (OR-logik)
    expect(result?.score).toBe(70)
  })

  it('IBAN med whitespace hanteras korrekt', () => {
    const result = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        counterparty_iban: 'SE45 7000 0000 0000 0000 0001', // Swedbank
        remittance_info: 'månadsavgift',
      }),
    )
    expect(result).not.toBeNull()
    expect(result?.reasons).toContain('IBAN-prefix matchar svensk bank')
  })

  it('TX utan IBAN eller bank-name men med ränta-text → ingen bank-bonus', () => {
    const result = classifyBankFeeTx(
      db,
      tx({
        amount_ore: 500,
        counterparty_iban: null,
        counterparty_name: 'Privatperson',
        remittance_info: 'Ränta', // bara interest-hit, ingen bank
      }),
    )
    // Interest 40 < MEDIUM 50 → null (ingen bank-bonus hjälper till)
    expect(result).toBeNull()
  })

  it('TX med bank-IBAN + ränta-text → interest_income (positivt belopp)', () => {
    const result = classifyBankFeeTx(
      db,
      tx({
        amount_ore: 15000,
        counterparty_iban: 'SE45 6000 0000 0000 0000 0001', // Handelsbanken
        remittance_info: 'Ränta sparkonto',
      }),
    )
    expect(result).not.toBeNull()
    expect(result?.type).toBe('interest_income')
    expect(result?.account).toBe('8310')
    expect(result?.series).toBe('A')
  })

  it('TX med bank-IBAN + ränta-text → interest_expense (negativt belopp)', () => {
    const result = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -2500,
        counterparty_iban: 'SE45 8000 0000 0000 0000 0001', // Swedbank
        // "Debiterad ränta" — ränta-match utan att matcha fee-kostnad
        remittance_info: 'Debiterad ränta',
      }),
    )
    expect(result).not.toBeNull()
    expect(result?.type).toBe('interest_expense')
    expect(result?.account).toBe('8410')
    expect(result?.series).toBe('B')
  })
})
