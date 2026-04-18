# Sprint O — T3.d-spec + Radix pilot ✅ KLAR

**Session:** 2026-04-18 (Sprint O, direkt efter Sprint N)
**Scope:** (1) T3.d MT940 + BGC parser-spec, (2) Radix UI-migration
pilot via ConfirmDialog + ADR 003.
**Estimat:** ~2 SP. **Faktiskt:** ~2 SP.

## Backlog-hantering

Två items från Sprint N-summary lyftes efter användarbegäran:

| Item | Tidigare status | Åtgärd i SO |
|---|---|---|
| **T3.d MT940 + BGC** | "Timing H2 2026, inte specat" | ✅ Spec skriven; timing-gate kan revideras |
| **Radix UI-migration** | "Nice-to-have utan nytta (M156 räcker)" | ✅ Pilot genomförd; ADR 003 rekommenderar full migration |

Den tidigare ståndpunkten i Sprint N-summary "Radix utan incremental
nytta" var empiriskt fel. Pilotens mätningar (26 % kod-reduktion,
förbättrade a11y-egenskaper, 0 regressions) ändrar analysen.

## Leverans

### P1 — T3.d MT940 + BGC parser-spec

Ny fil: [docs/t3d-mt940-bgc-spec.md](docs/t3d-mt940-bgc-spec.md) (~700 rader)

**Innehåll:**
- Bakgrund + gap-analys mot nuvarande camt.053/054-stöd
- **MT940-parser:** SWIFT-text-format, tag-mappning (`:20:` → statement_number,
  `:61:` → transactions, `:86:` → details), transaction-type-kod-mappning
  till BkTxCd (NCHG→CHRG, NINT→INTR) för classifier-integration
- **BGMAX-parser:** Bankgirocentralens fixed-width-format för
  inkommande bankgiro-betalningar, TK-prefix (01/05/20/25/30/40/50/51/70),
  pseudo-IBAN-konstruktion (`SE00BGMAX<bgnr>`), Latin-1-encoding via iconv-lite
- **Migration 044:** utöka `source_format` CHECK till
  `('camt.053', 'camt.054', 'mt940', 'bgmax')` via M122-mönstret
  (bank_statements har inkommande FK från bank_transactions och
  bank_reconciliation_matches)
- **Service-lager-integration:** `BankStatementFormat`-union,
  `detectFormat` för autodetektion från fil-content (BOM/header)
- **Test-plan:** 3 nya testfiler (~65 tester), 4 anonymiserade fixtures
- **Scope-out:** BGC Utbetalningar, MT942, multi-message-filer
- **Risk-analys:** encoding, parser-varianter, pseudo-IBAN-kollision,
  migration table-recreate

**Estimat implementation:** ~3-4 SP. **Beroenden:** test-fixtures (MT940
+ BGMAX från riktiga exempel eller konstruerade från spec).

### P2 — Radix UI pilot

**Installerat:**
- `@radix-ui/react-dialog@1.1.15`
- `@radix-ui/react-alert-dialog` (inkl transitive deps)
- Installerat via `npm install --force` (samma peer-dep-pattern som
  jsx-a11y i Sprint M).

**Migrerat:** [ConfirmDialog.tsx](src/renderer/components/ui/ConfirmDialog.tsx)
från custom `useDialogBehavior` till `@radix-ui/react-alert-dialog`.

**Resultat:**
- Kod: 89 → 66 rader (−26 %)
- API-surface oförändrat (samma props, samma semantik)
- Alla 8 ConfirmDialog-tester pass (inkl axe-core)
- Alla 2576 vitest pass — inga regressions
- 1 test uppdaterad: `session-29-confirm-dialog.test.tsx` asserted
  hardcoded `aria-labelledby="confirm-dialog-title"`. Radix auto-
  genererar IDs. Testet refaktorerat till beteende-check
  (`aria-labelledby` pekar på element med rätt text). Detta är
  en förbättring — testet kollar nu beteende, inte implementation.

**Bundle-impact:** ~15-20 KB gzipped för dialog + alert-dialog
primitives (tree-shakable).

### P3 — ADR 003

Ny fil: [docs/adr/003-radix-ui-migration.md](docs/adr/003-radix-ui-migration.md)

Analyserar pilot-resultat + tre alternativ:
- **Alt A (rekommenderad):** Full migration alla 6 dialoger + framtida
  primitives (tooltip, combobox, menu)
- **Alt B:** Endast nya dialoger, behåll befintliga (dual-mönster-problem)
- **Alt C:** Skippa Radix, utöka useDialogBehavior (reinvent wheel)

**Rekommendation:** Alt A. Pilot bevisar mätbar förbättring — 26 % mindre
kod, bättre a11y (inert/scroll-lock/portal), 0 regressions. Tidigare
ståndpunkt "Radix utan incremental nytta" (Sprint N) var fel.

**Implementation-plan för Sprint P (~2-3 SP):**
1. ConfirmFinalizeDialog → AlertDialog
2. PaymentDialog → Dialog + form
3. BulkPaymentDialog → Dialog + form (stor)
4. BulkPaymentResultDialog → Dialog
5. BatchPdfExportDialog → Dialog
6. Deprekera useDialogBehavior + uppdatera M156-doc

### Ingen ny infrastruktur

- Inga nya M-principer.
- Inga nya migrationer (PRAGMA `user_version`: 43 oförändrat).
- Inga nya IPC-kanaler.
- Inga nya ErrorCodes.

## Verifiering

- **Lint:** 0 problems ✅
- **TypeScript:** `npx tsc --noEmit` ✅
- **Vitest:** 2576 tester ✅ (oförändrat)
- **check:m133** + **check:m133-ast** + **check:m153** + **check:lint-new** ✅

## Filer (delta mot Sprint N tip)

**Modifierade (3):**
- `src/renderer/components/ui/ConfirmDialog.tsx` — Radix-migration
- `tests/session-29-confirm-dialog.test.tsx` — ARIA-test refaktorerat
- `package.json` + `package-lock.json` — Radix-deps

**Nya (3):**
- `docs/t3d-mt940-bgc-spec.md` — parser-spec
- `docs/adr/003-radix-ui-migration.md` — migration-beslut
- `docs/sprint-o-summary.md`

## Kvar i backlog

- **T3.d MT940 + BGC implementation** — spec klar, ~3-4 SP.
- **Radix full migration** — ADR 003 rekommenderar, ~2-3 SP.
- **IBAN-prefix-dispatch implementation** — spec klar, ~0.5-1 SP.
- **Sprint H (T3.a F62-e)** — fortsatt blockerad på revisor-samråd.
- **Space-på-rad-togglar-checkbox** (F49-c polish).

## Reflektioner

Sprint O är bevis på värdet av att empiriskt pröva en avvisad premiss.
Ståndpunkten "Radix utan nytta" byggde på antagandet att `useDialogBehavior`
täcker samma a11y-ytan. Pilotens konkrethet exposerade tre skillnader
(inert, scroll-lock, portal) som är svåra att argumentera bort utan
empirisk jämförelse.

Detsamma gäller T3.d MT940+BGC — "H2 2026"-timing-gaten byggde på
antagandet att specen skulle kräva mycket arbete att skriva. Faktiskt
tog specen en timme givet befintlig camt.053-parser som mall.

**Lärdom:** "Nice-to-have utan incremental nytta" och "timing-gate"
är ofta indirekta sätt att säga "jag har inte utvärderat ordentligt".
Empirisk pilot är billigare än förväntat och bevisar eller motbevisar
premisser.
