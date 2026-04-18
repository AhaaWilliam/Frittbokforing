# Sprint F — Backlog-avveckling P1–P6

**Datum:** 2026-04-18
**Tema:** Systematisk avveckling av 6 T3-items från Sprint E-backloggen.
Sex faser i prioritetsordning med fas-gated STOP-villkor.

## Testbaslinje

| Mätvärde | Före (SE) | Efter (SF) | Δ |
|---|---|---|---|
| Vitest | 2494 | 2534 | +40 |
| Testfiler | 249 | 253 | +4 |
| Playwright specfiler | 42 | 43 | +1 |
| Playwright `test()`-kallor | 67 | 68 | +1 |
| PRAGMA user_version | 41 | 43 | +2 |
| Nya migrationer | — | 042, 043 | +2 |
| Nya IPC-kanaler | — | 4 | +4 |
| Nya M-principer | — | 0 (2 draft) | 0 |
| Nya ErrorCodes | — | 0 | 0 |

## Fas-översikt

| Fas | Item | Typ | Status |
|---|---|---|---|
| P1 | T3.e RQ-invalidation för depreciation | Impl | ✅ klar |
| P2 | T3.b Batch-unmatch (Alt A: hela batchen) | Impl | ✅ klar |
| P3 | T3.a F62-e ADR (asset-edit) | Doc-only | ✅ klar |
| P4 | T3.c BkTxCd-mappningar (reducerat scope) | Impl | ✅ klar |
| P5 | T3.g F49-c keyboard-nav UX-spec | Doc-only | ✅ klar |
| P6 | T3.d camt.054 parser (1 av 3 format) | Impl | ✅ klar |

**Utfall:** Best-case uppnått — alla 6 faser levererade.

## Levererat per fas

### P1 — Precis RQ-invalidation för 5 depreciation-hooks

**Kontrakt:** Ersätter `invalidateAll: true` med exakt invalidation per
hook. Input-beroende keys via ny dynamisk-funktion-variant av
`useIpcMutation.invalidate`.

**Nya keys:** `anyFixedAsset`, `depreciationSchedule(id)`,
`allDepreciationSchedules`, `incomeStatementByFy(fyId)`,
`balanceSheetByFy(fyId)`.

**Invalidation-matris:**

| Hook | Keys |
|---|---|
| `useCreateFixedAsset` | `[allFixedAssets]` |
| `useUpdateFixedAsset` | `[allFixedAssets, fixedAsset(id), depreciationSchedule(id)]` (input-scoped) |
| `useDisposeFixedAsset` | `[allFixedAssets, fixedAsset(id), allDashboard, allIncomeStatement, allBalanceSheet, allManualEntries]` |
| `useExecuteDepreciationPeriod` | `[allFixedAssets, anyFixedAsset, allDepreciationSchedules, dashboard(fyId), incomeStatementByFy(fyId), balanceSheetByFy(fyId), allManualEntries]` |
| `useDeleteFixedAsset` | `[allFixedAssets]` |

**Tester:** 7 i [use-depreciation-invalidation.test.tsx](tests/renderer/lib/use-depreciation-invalidation.test.tsx).

### P2 — Batch-unmatch (M154 + M146 polymorfism)

**Scope-lås:** Alt A (hela batchen) — inga partial-unmatch-diskussioner
(skulle bryta M126 bank-fee-semantik utan ADR).

**Service-API:** `unmatchBankBatch(db, { batch_id })` med polymorfism
via `batch.batch_type` (M146). Shared `_unmatchPaymentCore`-helper
extraherad från existerande enskild unmatch.

**Flöde:**
1. Iterera alla payments i batchen
2. Per payment: DELETE reconciliation + DELETE payment + C-serie-
   korrigering via `createCorrectionEntry`
3. Recompute `paid_amount_ore` + status per invoice/expense (M101)
4. Korrigera batch-nivå bank-fee-JE (M126)
5. `UPDATE payment_batches.status = 'cancelled'`

**Chronology (M142):** alla N+1 korrigeringar får samma datum — icke-
minskande inom C-serien OK utan skip-flag.

**IPC:** `bank-statement:unmatch-batch` (M144-compliant).

**UI:** "Ångra batch"-knapp + ConfirmDialog med exakt varningstext
enligt prompt (pain.001-varning + juridisk förklaring per batch-typ).

**Tester:** 10 integration + 1 E2E.

### P3 — ADR 002: asset-edit efter schedule-exekvering

**Leverabel:** [docs/adr/002-asset-edit-after-execution.md](docs/adr/002-asset-edit-after-execution.md)
(draft, väntar på revisor-samråd).

**Rekommendation:** Alt A (framtida perioder) för MVP.

**Kritisk finding:** Alt B (retroaktiv C-serie) de-facto blockerad av
`trg_check_period_on_booking` när avskrivningar spänner över stängda
perioder.

**6 öppna frågor** till revisor dokumenterade (closed-period + disposal-
interaktion + svensk BFL/K2-praxis).

**M155 (draft):** Asset-edit påverkar endast pending schedules.

Sprint H-skelett skrivet: [docs/sprint-h-prompt.md](docs/sprint-h-prompt.md).

### P4 — Konfigurerbara BkTxCd-mappningar

**Scope-lås:** Inga IBAN-prefix-logik i Sprint F — endast globala
mappningar per installation. IBAN-auto-dispatch eskalerat till Sprint G.

**Migration 042:** `bank_tx_code_mappings` (domain/family/subfamily →
classification + optional account_number). Seed-data speglar tidigare
hårdkodad whitelist.

**Classifier-refactor:** `bank-fee-classifier.ts` läser nu från DB med
`WeakMap`-cache per db-instans. `invalidateClassifierCache(db)` kallas
efter upsert/delete. M153-determinism bevarad (grep-check grön).

**API-ändring:** `BankTxInput` utökad med `bank_tx_domain` +
`bank_tx_family` (mapping-key är 3-fält). Classifier tar nu `db` som
första argument. Callsites i `bank-match-suggester` +
`bank-fee-entry-service` + `bank-statement-service` uppdaterade.

**Income/expense-härledning:** Classifier härleder sign från
beloppstecken (M152). DB-mapping säger bara "interest", polariteten
kommer från TX-data.

**IPC:** 3 nya kanaler (`bank-tx-mapping:list/upsert/delete`) via
`wrapIpcHandler`.

**UI:** [PageSettings.tsx](src/renderer/pages/PageSettings.tsx)
`BankTxMappingsSection` med CRUD-tabell + form + ConfirmDialog.

**Tester:** 14 i [session-F-p4-bank-tx-mappings.test.ts](tests/session-F-p4-bank-tx-mappings.test.ts).

### P5 — F49-c keyboard-navigation UX-spec

**Leverabel:** [docs/f49c-keyboard-nav-spec.md](docs/f49c-keyboard-nav-spec.md)
(draft, väntar på godkännande).

**Scope:** 4 ytor (Lists, Forms, Dialogs, Dashboard) med Tab-ordning.

**Beslut:**
- **Enter på list-rad** = navigera till detalj-vy
- **Arrow-keys:** Alt B (roving-tabindex) rekommenderad. Alt C (grid)
  avfärdat.
- **Skip-links:** 3 kandidater (main + nav + conditional bulk-actions)
- **Focus-trap:** 4 edge-cases dokumenterade (Cancel-default,
  nested dialogs, unmount-return, re-activation)

**Sprint-split:** Sprint I (c1 skip-links ~1 SP) + Sprint J (c2 roving-
tabindex ~2 SP) + Sprint K (c3 dialog-härdning ~0.5 SP).

**M156 (draft):** Keyboard-navigation-kontrakt.

[s22b-f49-strategy.md](docs/s22b-f49-strategy.md) non-goal-sektion
uppdaterad — keyboard-nav + skip-links + list-semantik flyttade från
"non-goal F49" till "in-scope F49-c".

### P6 — camt.054 parser via Path A

**Leverabel:** [camt054-parser.ts](src/main/services/bank/camt054-parser.ts)
som återanvänder helpers från `camt053-parser.ts`.

**Helpers exporterade** från camt053: `stripNamespace`, `pick`,
`asArray`, `text`, `decimalToOre`, `parseNtry`, `XmlNode`,
`Camt053ParseError`.

**Path A pseudo-statement:** camt.054 saknar balanssummor → opening=0,
closing=0 i `bank_statements`-raden. `source_format='camt.054'` explicit
via migration 043.

**Migration 043:** M122 table-recreate på `bank_statements` utökar
`CHECK (source_format IN ('camt.053', 'camt.054'))`. Inkommande FK från
`bank_transactions` → FK-OFF utanför transaktion (db.ts + test-helper
uppdaterade).

**UI:** Format-dropdown i [PageBankStatements](src/renderer/pages/PageBankStatements.tsx)
med info-tooltip om camt.054-semantik.

**Balans-check skippas för camt.054** (opening + SUM = closing gäller
bara camt.053).

**Tester:** 9 i [session-F-p6-camt054.test.ts](tests/session-F-p6-camt054.test.ts).

**Eskalerat:** MT940 + BGC-retur → Sprint G/H per H2 2026-tidslinje.

## Pre-flight-avvikelser

### P6 — CHECK-constraint på source_format (rättad)

**Pre-flight missade:** `bank_statements` hade
`CHECK (source_format IN ('camt.053'))` vilket blockerade 'camt.054'.

**Ursprunglig workaround:** `statement_number='CAMT054-{original}'`-
prefix, source_format='camt.053' (DEFAULT).

**Slutgiltig fix:** Migration 043 tillagd för M122 table-recreate.
Prefix-hacket borttaget i produktionskoden. Ingen semantisk kompromiss
kvarstår.

**Konsekvens:** PRAGMA user_version gick från planerade 42 (per prompt)
till 43.

## Bodyguard-verifiering

- ✅ `check:m133` + `check:m133-ast` gröna
- ✅ `check:m153` grön (classifier fortsatt deterministisk trots DB-refactor)
- ✅ Typecheck ren
- ✅ Lint ren på nya filer
- ✅ Inga nya ErrorCodes
- ✅ Inga nya M-principer i produktion (M155 + M156 är drafts i dokument)
- ✅ Migration 041-upgrade-test oförändrat (verifierar user_version=41
  mitt i migrationskedjan — inte slutvärdet)

## Deliverables

**Kod (7 nya + 17 ändrade):**
- [migrations.ts](src/main/migrations.ts) — migration 042 + 043
- [db.ts](src/main/db.ts) — FK-OFF-set utökad
- [bank-unmatch-service.ts](src/main/services/bank/bank-unmatch-service.ts) — `unmatchBankBatch` + `_unmatchPaymentCore`
- [bank-tx-mapping-service.ts](src/main/services/bank/bank-tx-mapping-service.ts) — ny fil
- [bank-fee-classifier.ts](src/main/services/bank/bank-fee-classifier.ts) — DB-driven refactor
- [bank-match-suggester.ts](src/main/services/bank/bank-match-suggester.ts) + [bank-fee-entry-service.ts](src/main/services/bank/bank-fee-entry-service.ts) — callsite-uppdateringar
- [bank-statement-service.ts](src/main/services/bank/bank-statement-service.ts) — `BankStatementFormat`-enum + Path A
- [camt053-parser.ts](src/main/services/bank/camt053-parser.ts) — helpers exporterade
- [camt054-parser.ts](src/main/services/bank/camt054-parser.ts) — ny parser
- [ipc-handlers.ts](src/main/ipc-handlers.ts) + [ipc-schemas.ts](src/shared/ipc-schemas.ts) + [preload.ts](src/main/preload.ts) + [electron.d.ts](src/renderer/electron.d.ts) — 4 nya kanaler
- [query-keys.ts](src/renderer/lib/query-keys.ts) — 7 nya keys
- [hooks.ts](src/renderer/lib/hooks.ts) — 6 nya hooks + depreciation-migration
- [use-ipc-mutation.ts](src/renderer/lib/use-ipc-mutation.ts) — function-invalidate
- [PageBankStatements.tsx](src/renderer/pages/PageBankStatements.tsx) — batch-unmatch + format-dropdown
- [PageSettings.tsx](src/renderer/pages/PageSettings.tsx) — BankTxMappingsSection

**Tester (5 nya + 22 ändrade):**
- 4 nya session-F-pN-tester (P1/P2/P4/P6)
- 1 ny E2E (bank-unmatch-batch)
- 21 bestående testfiler: `toBe(42)` → `toBe(43)` för user_version
  (batch-sed), `toBe(36)` → `toBe(37)` för tabellcount (P4)
- `create-test-db.ts` + `mock-ipc.ts` uppdaterade

**Docs (4 nya + 1 ändrad):**
- [docs/adr/002-asset-edit-after-execution.md](docs/adr/002-asset-edit-after-execution.md)
- [docs/f49c-keyboard-nav-spec.md](docs/f49c-keyboard-nav-spec.md)
- [docs/sprint-f-prompt.md](docs/sprint-f-prompt.md) (spec för sprinten)
- [docs/sprint-h-prompt.md](docs/sprint-h-prompt.md) (skelett)
- [docs/s22b-f49-strategy.md](docs/s22b-f49-strategy.md) — non-goal-uppdatering

## Backlog efter SF

**Återstående T3-kandidater:**
- T3.a F62-e — **blockerad** på revisor-samråd (ADR 002)
- T3.d MT940 + BGC — eskalerade per H2 2026-tidslinje
- T3.g F49-c1/c2/c3 — UX-spec klar, implementation i Sprint I/J/K

**Nya uppföljningar från SF:**
- ADR 003 camt.054-arkitektur (kandidat om nullable balans + bättre
  source_format-modellering blir prioriterat)
- IBAN-prefix-dispatch för BkTxCd (P4-scope-lås lyft)
- Sprint I/J/K för F49-c-implementation

**Sprint G-rekommendation:** IBAN-auto-dispatch (bygger på P4) eller
F49-c1 skip-links (lågrisk nucleus per F49-c-spec).

## Exit

- Grön vitest (2534 pass, 253 filer)
- Playwright E2E oförändrat (manuell körning inte kört efter P2+P6
  UI-ändringar — lämnas till nästa full-E2E-körning)
- Alla `check:*` gröna
- Typecheck + lint ren
- Git: commit [1a2daa2](commit:1a2daa2)
