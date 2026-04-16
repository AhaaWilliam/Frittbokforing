# Sprint 53 — Tre förankrade beslut före kodning

**Session:** S53 • **Datum:** 2026-04-16 • **Scope:** F62 (avskrivningar) + F65 (kassaflöde) + F63/F64-polish

Detta dokument fastställer de tre designbeslut som blockerar all implementation i Sprint 53. Besluten förankras i existerande CLAUDE.md-principer och tidigare sprintsummaries där möjligt; annars i explicit motivering.

---

## Beslut 1 — E-serie för avskrivningar (val: A)

**Val:** Ny **E-serie** (Depreciation), analog med **I-serie** (M145) och C-serie (Manual/Accrual).

**Existerande serier (verifierat i kodbas):**
- `A` — fakturor (invoice-service)
- `B` — kostnader (expense-service)
- `C` — manuella verifikat, periodiseringar, K1 årsresultat, korrigeringar (manual-entry, accrual, fiscal, correction, opening-balance bookYearEndResult)
- `I` — SIE4-import (sie4-import-service)
- `O` — ingående balans (opening-balance-service createOpeningBalance)
- `E` — **NY** avskrivningar (Sprint 53 F62)

D-serien är INTE i bruk idag. Tidigare utkast av detta dokument listade felaktigt 'D' i whitelistan.

**Motivering:**
1. `source_type='auto_depreciation'` **finns redan i CHECK-enum** sedan migration 001 (verifierat: `migrations.ts:121`, `:859`, `:1760`). Ursprungsdesignen avsåg separat hantering av auto-genererade avskrivningsposter — E-serien realiserar den intentionen.
2. **Separation av auto-genererade från manuella verifikat** förenklar revision och SIE-export. C-serien blandar idag manuella verifikat, periodiseringar (accruals) och skulle även blanda avskrivningar — för många orelaterade poster i samma serie.
3. **Paritet med I-serien** (M145) som etablerat mönstret att "auto-genererad körning av batch-processer får egen serie".
4. **K2/K3-revisor-perspektiv:** En separat serie syns tydligt i kontoutdrag och ger enkel filtrering vid årsbokslutsgranskning. Standarden kräver det inte, men det förbättrar användbarheten.

**Defense-in-depth — CHECK-constraint:**
Ingen CHECK-constraint finns idag på `journal_entries.verification_series` (verifierat: grep `verification_series` i `migrations.ts` visar enbart `TEXT NOT NULL DEFAULT 'A'`). Detta är en latent risk — ogiltiga serier kan hamna i DB via direkt SQL eller framtida kod-regression.

Sprint 53 F62.1 lägger till:
```sql
CHECK (verification_series IN ('A','B','C','E','I','O'))
```

Detta kräver **table-recreate via M122** (journal_entries har inkommande FK från invoice_payments, expense_payments, manual_entries, invoices, expenses, payment_batches per CLAUDE.md-avsnitt M122). Pre-flight-regressionstest:

```sql
SELECT DISTINCT verification_series FROM journal_entries
```

måste returnera endast värden i whitelist INNAN CHECK läggs till. Om annat värde existerar → abort migration och utred.

**Cross-table trigger-inventering (M141):**
Pre-flight-query innan table-recreate:
```sql
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type='trigger' AND sql LIKE '%journal_entries%' AND tbl_name != 'journal_entries';
```
Förväntat resultat: trg_no_correct_with_payments (tbl=journal_entries i praktiken — attached till själva tabellen, M121), trg_check_period_on_booking (på accounting_periods? — nej, på journal_entries via trigger 7). Alla triggers ska återskapas per M121.

**Nummertilldelning:**
`verification_sequences`-tabellen är droppad (migration 028). E-serien följer samma mönster som övriga serier:
```sql
SELECT COALESCE(MAX(verification_number), 0) + 1
FROM journal_entries
WHERE verification_series = 'E' AND fiscal_year_id = ?
```

**Ny M-princip (M151):** Dokumenteras i CLAUDE.md efter F62 levererats.

---

## Beslut 2 — Partial-success-policy för period-exekvering (val: Följ M113)

**Val:** `executeDepreciationPeriod(fiscalYearId, periodEndDate)` följer **M113-mönstret** (bulk-best-effort med nestade savepoints).

**Motivering:**
M113 etablerar standardmönstret i kodbasen för bulk-operationer med delad fel-isolering. Avskrivningskörning är konceptuellt identisk med bulk-payments — många oberoende transaktioner som inte ska blockera varandra vid per-rad-fel. Avvikelse från mönstret skulle bryta konsistens och överraska framtida underhållare.

**Specifikation:**
```typescript
function executeDepreciationPeriod(fiscalYearId: number, periodEndDate: string): IpcResult<{
  succeeded: Array<{ asset_id: number; schedule_id: number; journal_entry_id: number }>
  failed: Array<{ asset_id: number; schedule_id: number; error: string; code: ErrorCode }>
  batch_status: 'completed' | 'partial' | 'cancelled'
}>
```

**Semantik:**
- **Yttre** `db.transaction()` omsluter hela körningen (M113 rad 1).
- **Per schedule:** `db.transaction(singleScheduleTx)()` körs som **nested savepoint**. Kastar strukturerat fel (M100) → samlas i `failed[]`, övriga fortsätter.
- **`batch_status`:**
  - `'completed'` om alla lyckas (failed.length === 0)
  - `'partial'` om minst en lyckas och minst en misslyckas
  - `'cancelled'` om alla misslyckas (succeeded.length === 0) → hela batchen rullas tillbaka (ingen commit)

**Chronology-check (M142):** Körs per schedule inom savepointen (skipChronologyCheck = false för individuella körningar) eftersom varje schedule har eget datum. Alternativt: för ren period-körning där alla schedules delar samma `period_end` kan checken göras en gång på batch-nivå och skipas per rad — detta är en mindre optimering som beslutas i implementation om mätning visar det nödvändigt.

**Cancelled = ingen commit:** M113 etablerar att "Om alla misslyckas returneras `status: 'cancelled'` utan batch-rad". För avskrivningar: ingen E-serie-verifikat skrivs, ingen schedule uppdateras, svaret är `{ succeeded: [], failed: [...], batch_status: 'cancelled' }`.

**Varför inte "allt-eller-inget"?** Om en tillgång har schedule med period i ett stängt räkenskapsår (trigger 7 `trg_check_period_on_booking` blockerar) ska det fela isolerat och övriga 49 tillgångar få sina avskrivningar bokförda. Allt-eller-inget skulle kräva att användaren fixar 1 fel innan 49 lyckas — sämre UX utan bokföringsmässig vinst.

---

## Beslut 3 — Rörelsekapital-definition för kassaflöde (val: K2/K3-standard)

**Val:** Hårdkodade intervall per svensk K2/K3-standard, exponerade som delad konstant.

**Intervall:**

| Kategori | Intervall | BAS-benämning |
|---|---|---|
| **Likvida medel** (exkluderas) | 1900–1999 | Kassa, bank, plusgiro |
| Kortfr. fordringar — varulager | 1400–1499 | Varulager |
| Kortfr. fordringar — kundfordringar | 1500–1599 | Kundfordringar |
| Kortfr. fordringar — övriga | 1600–1699 | Övriga kortfristiga fordringar |
| Kortfr. fordringar — upplupna/förutbetalda | 1700–1799 | Förutbetalda kostn./upplupna intäkter |
| Kortfr. skulder — leverantörsskulder | 2400–2499 | Leverantörsskulder |
| Kortfr. skulder — moms | 2600–2699 | Momsredovisning |
| Kortfr. skulder — övriga | 2800–2899 | Övriga kortfristiga skulder |
| Kortfr. skulder — upplupna/förutbetalda | 2900–2999 | Upplupna kostn./förutbetalda intäkter |

**Exkluderade från rörelsekapital-delta:** 1800–1899 (kortfristiga placeringar), 2000–2099 (eget kapital), 2100–2399 (obeskattade reserver + långfristiga skulder), 2500–2599 (skatteskulder — ingår i tax-beräkning separat), 2700–2799 (personalrelaterade skulder — behandlas separat i framtida iteration).

**Skäl för denna snävare definition:**
Indirekt metod kräver strikt separation mellan:
- Operativ kassaflöde (justerat årets resultat + Δrörelsekapital)
- Investerings-kassaflöde (Δanläggningstillgångar 1000-1299)
- Finansierings-kassaflöde (Δ långfristiga skulder 2300-2399 + ΔEK exkl. årets resultat 2000-2099)

Konton 2500-2799 (skatter, personalskulder) ligger i en gråzon som i fullskalig rapportering separeras. Första iterationen håller sig till K2-standardens rörelsekapital-definition; utvidgning till skatte-/personalskulder kan ske i framtida iteration om användarbehov uppstår.

**Implementation:**
Konstanten definieras i `src/shared/k2-mapping.ts` (eller ny fil `src/shared/cashflow-ranges.ts` om k2-mapping är låst mot RR/BR — beslut i F65.1-implementation):

```typescript
export const WORKING_CAPITAL_RANGES = {
  current_assets: [
    { from: 1400, to: 1499, label: 'Varulager' },
    { from: 1500, to: 1599, label: 'Kundfordringar' },
    { from: 1600, to: 1699, label: 'Övriga kortfristiga fordringar' },
    { from: 1700, to: 1799, label: 'Förutbetalda kostnader och upplupna intäkter' },
  ],
  current_liabilities: [
    { from: 2400, to: 2499, label: 'Leverantörsskulder' },
    { from: 2600, to: 2699, label: 'Momsredovisning' },
    { from: 2800, to: 2899, label: 'Övriga kortfristiga skulder' },
    { from: 2900, to: 2999, label: 'Upplupna kostnader och förutbetalda intäkter' },
  ],
  cash: [{ from: 1900, to: 1999, label: 'Likvida medel' }],
  investing: [{ from: 1000, to: 1299, label: 'Anläggningstillgångar' }],
  financing_liabilities: [{ from: 2300, to: 2399, label: 'Långfristiga skulder' }],
  financing_equity: [{ from: 2000, to: 2099, label: 'Eget kapital' }],  // exkl. årets resultat
} as const
```

**Single source of truth (M96/M98):**
- Både `result-service` (för årets resultat) och `cashflow-service` (F65) läser denna konstant.
- Ingen lexikografisk jämförelse — alla filtreringar använder `matchesRanges()`-mönstret (M98) eller SQL `CAST(SUBSTR(account_number || '0000', 1, 4) AS INTEGER) BETWEEN from AND to`.
- Återanvänder `getOpeningBalancesFromPreviousYear` (opening-balance-service) och `getBalanceSheetAccountBalances` (report-service) — ingen duplikation av query-logik.

**Invariant-test (kritiskt för F65):**
```typescript
operatingCashFlow + investingCashFlow + financingCashFlow
  === closingCash - openingCash  // exakt i öre, inte tolerans
```

Detta är en bokföringsinvariant — inte en tolerans-check. Differens ≠ 0 → bug i beräkningen.

---

## Sammanfattning

| Beslut | Val | M-referens | Regression-guard |
|---|---|---|---|
| 1. Avskrivningsserie | E-serie + CHECK | M121/M122/M141 + ny M151 | SELECT DISTINCT verification_series |
| 2. Partial-success | M113-mönster | M100, M113, M142 | Invariant-test per FY-status |
| 3. Rörelsekapital | K2/K3-intervall i shared konstant | M96, M98 | Invariant test sum === Δcash |

Alla tre beslut är förankrade i existerande principer — inga nya designfrågor kräver användarbeslut innan implementation. Sprint 53 kan starta omedelbart efter baseline-check (npm test + playwright + check:m133).
