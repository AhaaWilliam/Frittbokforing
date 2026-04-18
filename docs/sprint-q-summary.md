# Sprint Q — useDialogBehavior-radering + Sprint H Alt A + T3.d impl ✅ KLAR

**Session:** 2026-04-18 (Sprint Q, direkt efter Sprint P)
**Scope:** Stänga tre backlog-items: useDialogBehavior-radering,
Sprint H Alt A-implementation, T3.d MT940+BGMAX parser-implementation.
**Estimat:** ~5-6 SP. **Faktiskt:** ~5 SP.

## Leverans

### Q1 — useDialogBehavior raderad

- `src/renderer/lib/use-dialog-behavior.ts` **borttagen** (deprekerad
  sedan Sprint P, nu raderad efter verifierat att inga nya imports
  tillkommit).
- `tests/renderer/lib/use-dialog-behavior.test.tsx` **borttagen**.
- Referens i `ConfirmFinalizeDialog.test.tsx`-kommentar uppdaterad
  till "Radix AlertDialog-primitive".

### Q2 — Sprint H Alt A (M155 accepterad)

**Implementation i [depreciation-service.ts](src/main/services/depreciation-service.ts):**
- Tog bort `HAS_EXECUTED_SCHEDULES`-guard i `updateFixedAsset`.
- Ny `insertPendingFromState`-helper regenererar pending-schedules från
  `period executedCount + 1` med `bookValueAfterExecuted` som cost-input
  till `generateLinearSchedule` / `generateDecliningSchedule`.
- Validering vid executed-historik:
  - `input.useful_life_months > executedCount` (annars VALIDATION_ERROR)
  - `acquisition_cost_ore - executedAccOre >= residual_value_ore`
    (annars VALIDATION_ERROR)
- DELETE endast pending-rader; executed + skipped bevaras oförändrade.

**Tester ([session-C-depreciation-update.test.ts](tests/session-C-depreciation-update.test.ts)):**
- Ersatt 2 HAS_EXECUTED_SCHEDULES-tester med 4 M155-tester:
  - Alt A: edit efter executed bevarar historik, regenererar pending
  - Alt A: VALIDATION_ERROR om useful_life ≤ executedCount
  - Alt A: VALIDATION_ERROR om residual > bookValueAfterExecuted
  - Alt A: remaining-fördelning summerar till
    `new_cost - new_residual - executed_acc` (invariant)
- Skipped-test uppdaterad: update lyckas + skipped bevaras.

**ADR 002-status:** Draft → **Implemented (interim Alt A)**.
Revisor-samråd kvar som framtida-utvärdering; om K2-praxis kräver
Alt B för rättelse-scenarier kan det implementeras ovanpå Alt A.

**M155 ny accepterad M-princip** — CLAUDE.md § 60.

### Q3 — T3.d MT940 + BGMAX parsers

Implementation enligt [docs/t3d-mt940-bgc-spec.md](docs/t3d-mt940-bgc-spec.md).

**Nya filer:**
- [src/main/services/bank/mt940-parser.ts](src/main/services/bank/mt940-parser.ts) — SWIFT-textformat
  - `:20:`/`:25:`/`:60F:`/`:61:`/`:86:`/`:62F:`-taggar
  - SWIFT-header-block 1-3 hoppas över (stöd för {1:...}{2:...}{4:...-})
  - Strukturerade `:86:`-tags (`/NAME/`, `/IBAN/`, `/REMI/`, `/TRCD/`)
  - Fri text-fallback om tags saknas
  - CRLF/BOM-tolerans, okända tags ignoreras tolerant
- [src/main/services/bank/mt940-bktxcd-mapping.ts](src/main/services/bank/mt940-bktxcd-mapping.ts) — MT940-kod → BkTxCd
  - NCHG → PMNT/CCRD/CHRG (bank-fee-classifier-integration)
  - NINT → PMNT/CCRD/INTR
  - NTRF, NDDT, NMSC, NCOM (utökas vid behov)
- [src/main/services/bank/bgmax-parser.ts](src/main/services/bank/bgmax-parser.ts) — Bankgirocentralens format
  - TK=01 (filhuvud), TK=05 (BG-nummer), TK=20 (betalning),
    TK=25 (namn), TK=29 (meddelande), TK=70 (footer)
  - Fixed-width position-baserad parsning
  - Pseudo-IBAN: `SE00BGMAX<bgnr>` (BG ≠ IBAN; bank_account_iban är NOT NULL)
  - Opening/closing = 0 (notifikationsformat, ingen balans)
  - Latin-1-tolerant (input antas redan dekoderat)

**Service-integration ([bank-statement-service.ts](src/main/services/bank/bank-statement-service.ts)):**
- `BankStatementFormat` utökat: `'camt.053' | 'camt.054' | 'mt940' | 'bgmax'`
- Ny exported `detectFormat(content)` — autodetektion via BOM/header:
  - `<?xml` + `BkToCstmrStmt` → camt.053
  - `<?xml` + `BkToCstmrDbtCdtNtfctn` → camt.054
  - `{1:` eller `:20:` → mt940
  - `^01\d{10,}` → bgmax
  - annars PARSE_ERROR
- `importBankStatement` default-format: detectFormat när omitted
  (tidigare `'camt.053'`)
- 4-path switch för parsing med unified error-handling (Camt053/Mt940/
  Bgmax-ParseError konverteras till IpcResult VALIDATION_ERROR)

**Migration 044 ([migrations.ts](src/main/migrations.ts)):**
- M122 table-recreate på `bank_statements` (inkommande FK från
  bank_transactions + bank_reconciliation_matches).
- `source_format` CHECK utökad till
  `('camt.053', 'camt.054', 'mt940', 'bgmax')`.
- PRAGMA user_version: 43 → **44**.
- `db.ts` + `tests/helpers/create-test-db.ts` FK_OFF-guard utökad
  med index 43.

**Zod-schema ([ipc-schemas.ts](src/shared/ipc-schemas.ts)):**
- `BankStatementImportSchema.format`-enum utökat till 4 format.

**Tester (3 nya filer, 52 tester):**
- [session-Q-mt940-parser.test.ts](tests/session-Q-mt940-parser.test.ts) — 25 tester
  (happy-path, :61: + :86:, belopp, errors, BkTxCd-mapping, tolerans)
- [session-Q-bgmax-parser.test.ts](tests/session-Q-bgmax-parser.test.ts) — 17 tester
  (TK-parsning, flera betalningar, åäö, encoding, errors)
- [session-Q-bank-import-autodetect.test.ts](tests/session-Q-bank-import-autodetect.test.ts) — 10 tester
  (format-detection för camt.053/054/MT940/BGMAX + edge-cases)

## Verifiering

- **Lint:** 0 problems ✅ (efter prettier-autofix + unused-var-cleanup)
- **TypeScript:** `npx tsc --noEmit` ✅
- **Vitest:** se final verification-sektion
- **check:m133** + **check:m133-ast** + **check:m153** + **check:lint-new** ✅
- **PRAGMA user_version:** 43 → **44**

## Filer (delta mot Sprint P tip)

**Nya (7):**
- `src/main/services/bank/iban-bank-registry.ts` — _inte nytt, från SP_
- `src/main/services/bank/mt940-parser.ts`
- `src/main/services/bank/mt940-bktxcd-mapping.ts`
- `src/main/services/bank/bgmax-parser.ts`
- `tests/session-Q-mt940-parser.test.ts`
- `tests/session-Q-bgmax-parser.test.ts`
- `tests/session-Q-bank-import-autodetect.test.ts`
- `docs/sprint-q-summary.md`

**Borttagna (2):**
- `src/renderer/lib/use-dialog-behavior.ts`
- `tests/renderer/lib/use-dialog-behavior.test.tsx`

**Modifierade (8):**
- `src/main/services/depreciation-service.ts` — Alt A-implementation
- `src/main/services/bank/bank-statement-service.ts` — 4-format-support
- `src/main/migrations.ts` — migration 044
- `src/main/db.ts` — FK_OFF-guard index 43
- `src/shared/ipc-schemas.ts` — format-enum utökat
- `tests/helpers/create-test-db.ts` — FK_OFF-guard
- `tests/session-C-depreciation-update.test.ts` — Alt A-tester
- `tests/renderer/components/ui/ConfirmFinalizeDialog.test.tsx` — kommentar
- `docs/adr/002-asset-edit-after-execution.md` — status → Implemented
- `CLAUDE.md` — M155 § 60 + ADR 002/003 i referenslista

## Kvar i backlog

- **Sprint H Alt B (eventuell):** om revisor senare kräver retroaktiv
  C-serie-korrigering för rättelse-scenarier. Separat code path
  ovanpå Alt A.
- **T3.d rest:** BGC Utbetalningar, MT942, multi-message-filer,
  utökade MT940-varianter per bank (scope-out i spec).
- **Utländska IBAN i registry:** Norge, Danmark, Tyskland om behov.
- **Space-på-rad-togglar-checkbox** (F49-c polish).
- **Fixtures-dogfooding:** verifiering av MT940/BGMAX-parser mot
  verkliga (anonymiserade) fil-exempel från svenska banker.

## Observation

Tre backlog-items stängda i samma sprint. De tidigare bedömningarna:
- Sprint H "revisor-blockerad" → Alt A som interim räckte (revisor kan
  revidera senare)
- T3.d "timing H2 2026" → spec + parsers kunde skrivas nu, verklig
  verifiering kräver bara fixtures
- useDialogBehavior "vänta till Sprint Q" → raderad utan incident

Samma mönster som SO/SP visade: empirisk undersökning är ofta billigare
än den förväntade komplexiteten, särskilt när spec är förhandsskriven.
