import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../../src/main/services/manual-entry-service'
import { createCorrectionEntry } from '../../src/main/services/correction-service'

/**
 * M140 — Korrigeringsverifikat en-gångs-lås.
 *
 * Original-verifikat kan korrigeras EN gång. Efter det:
 * - Originalet får status='corrected' + corrected_by_id satt → låst
 * - Korrigerings-verifikatet har corrects_entry_id satt → kan inte själv korrigeras
 *
 * Detta ger permanent lås efter en korrigering. Chains blockeras medvetet.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function seed() {
  const db = createTestDb()
  ok(
    createCompany(db, {
      name: 'Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id

  // Skapa + bokföra ett manuell-entry (C-serien) för att korrigera
  const draft = ok(
    saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2026-02-01',
      description: 'Original',
      lines: [
        { account_number: '1930', debit_ore: 10000, credit_ore: 0 },
        { account_number: '2440', debit_ore: 0, credit_ore: 10000 },
      ],
    }),
  )
  const finalized = ok(finalizeManualEntry(db, draft.id, fyId))
  return { db, fyId, originalJeId: finalized.journalEntryId }
}

describe('M140 — korrigering en-gångs-lås', () => {
  it('första korrigeringen lyckas + markerar original som corrected', () => {
    const { db, fyId, originalJeId } = seed()
    const r = ok(
      createCorrectionEntry(db, {
        journal_entry_id: originalJeId,
        fiscal_year_id: fyId,
      }),
    )
    expect(r.correction_entry_id).toBeGreaterThan(0)

    const original = db
      .prepare(
        `SELECT status, corrected_by_id FROM journal_entries WHERE id = ?`,
      )
      .get(originalJeId) as { status: string; corrected_by_id: number }
    expect(original.status).toBe('corrected')
    expect(original.corrected_by_id).toBe(r.correction_entry_id)
  })

  it('försök att korrigera ett redan korrigerat original blockeras', () => {
    const { db, fyId, originalJeId } = seed()
    ok(
      createCorrectionEntry(db, {
        journal_entry_id: originalJeId,
        fiscal_year_id: fyId,
      }),
    )
    const r = createCorrectionEntry(db, {
      journal_entry_id: originalJeId,
      fiscal_year_id: fyId,
    })
    expect(r.success).toBe(false)
  })

  it('försök att korrigera själva korrigeringsverifikatet blockeras', () => {
    const { db, fyId, originalJeId } = seed()
    const first = ok(
      createCorrectionEntry(db, {
        journal_entry_id: originalJeId,
        fiscal_year_id: fyId,
      }),
    )
    // Försök korrigera korrigeringsverifikatet
    const r = createCorrectionEntry(db, {
      journal_entry_id: first.correction_entry_id,
      fiscal_year_id: fyId,
    })
    expect(r.success).toBe(false)
  })

  it('korrigeringsverifikat har corrects_entry_id satt till originalet', () => {
    const { db, fyId, originalJeId } = seed()
    const r = ok(
      createCorrectionEntry(db, {
        journal_entry_id: originalJeId,
        fiscal_year_id: fyId,
      }),
    )
    const corr = db
      .prepare(
        `SELECT corrects_entry_id FROM journal_entries WHERE id = ?`,
      )
      .get(r.correction_entry_id) as { corrects_entry_id: number }
    expect(corr.corrects_entry_id).toBe(originalJeId)
  })

  it('M139: korrigeringsverifikat-description innehåller referens till original', () => {
    const { db, fyId, originalJeId } = seed()
    const r = ok(
      createCorrectionEntry(db, {
        journal_entry_id: originalJeId,
        fiscal_year_id: fyId,
      }),
    )
    const corr = db
      .prepare(`SELECT description FROM journal_entries WHERE id = ?`)
      .get(r.correction_entry_id) as { description: string }
    // M139: "avser" eller "rättelse av" eller "korrigering" — eller
    // specifikt ver_number från originalet. Accepterar alla mönster som
    // innehåller "#" eller originalverifikatets verifikationsnummer.
    expect(corr.description).toMatch(/korrig|rättels|#\d+|avser/i)
  })
})
