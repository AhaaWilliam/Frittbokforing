Sprint F — Backlog-avveckling: T3.e → T3.b → T3.a → T3.c → T3.g → T3.d

**Datum:** 2026-04-17 (planerat)
**Tema:** Systematisk avveckling av T3-backloggen från Sprint E. Sex
faser (P1–P6) i prioritetsordning per Sprint E-summary.

Prompten är avsiktligt **multi-sprint-stor**. Totalestimat: 14–22 SP
(3–5 traditionella sprintar). Strukturen är **fas-gated**: varje fas
har ett eget exit-kriterium och ett STOP-villkor. Om en fas växer
utöver sitt estimat → slutför fasen, commit + summary, eskalera
kvarvarande till Sprint G — utvidga inte scope ad hoc.

**Två faser levererar ENDAST dokumentation (ADR/UX-spec), inte
implementation:** P3 (T3.a — kräver revisor-samråd) och P5 (T3.g —
kräver UX-spec innan kod). Motiverat i respektive fassektion.

---

## Scope-risk (läs först)

Sex T3-items i en prompt är ambitiöst. Realistiskt utfall:

| Scenario | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| Best-case | ✅ impl | ✅ impl | ✅ ADR | ✅ impl | ✅ spec | ✅ 1 format |
| Realistiskt | ✅ impl | ✅ impl | ✅ ADR | ⏸ eskalera | ✅ spec | ⏸ eskalera |
| Sämsta-case | ✅ impl | ⏸ eskalera | ✅ ADR | ⏸ eskalera | ✅ spec | ⏸ eskalera |

P1, P3, P5 är lågrisk (impl kort / doc-only). P2, P4, P6 kan kräva
full sprint var — om ett av dem visar sig större än estimerat,
**stoppa** och commit + summary, fortsätt i Sprint G.

**STOP-villkor gemensamma för alla faser:**
- Ny M-princip utan eng-review
- Ny migration utan M122-audit (inkommande FK-referenser inventerade)
- Ny IPC-kanal som bryter mot M144 (måste använda wrapIpcHandler)
- Bryter M150 (new Date() utan argument i main-process)
- Bryter M153 (icke-deterministisk scoring i bank-scope)

Om någon STOP-villkor triggas → fasen stoppas, problemet dokumenteras
i Sprint F-summary, fasen eskaleras till Sprint G med tydlig ägare.

---

## Testbaslinje (verifierad post-Sprint E)

- **2494 vitest** (249 testfiler)
- **42 Playwright-specfiler, 67 `test()`-kallor** — full E2E 67p/0f
- **PRAGMA user_version: 41**
- **HashRouter** — alla URL:er är `#/path?params`

---

## Pre-flight-fakta (verifierade 2026-04-17)

| Check | Resultat | Påverkan |
|---|---|---|
| `useIpcMutation` API | Stödjer redan `invalidate: readonly (readonly unknown[])[]` [use-ipc-mutation.ts:8](src/renderer/lib/use-ipc-mutation.ts:8) | P1 använder fältnamn **`invalidate`**, inte `invalidateKeys`. Inget API-tillägg krävs. |
| `bank_statements.opening_balance_ore` | `NOT NULL` [migrations.ts:1380](src/main/migrations.ts:1380) | P6 använder **Path A** (pseudo-statement med opening=0, closing=0) — ingen migration. |
| `bank_transactions.bank_statement_id` | `NOT NULL` [migrations.ts:1391](src/main/migrations.ts:1391) | P6 kan inte skapa orphan-TX, måste länka till (pseudo-)statement. |
| `grep invalidateAll src/renderer/lib/hooks.ts` | 15+ träffar (inte bara depreciation) | P1 är scope-begränsad till 5 depreciation-hooks. Övriga utanför scope. |
| `bank-fee-classifier.ts` IBAN-logik | Ingen existerande IBAN-parsing | P4 **reduceras**: `'*'`-fallback + manuell classification per rad i UI, ingen IBAN-auto-dispatch. |

**Om något pre-flight avviker vid sprint-start:** stoppa berörd fas och
eskalera till Sprint G med triage-logg.

---

## Migrations-nummer-strategi

Migrationer i denna sprint tilldelas i **implementations-ordning, inte
fas-ordning**. Enda fasen som potentiellt behöver migration är P4
(`042`). P6 Path A kräver **ingen** migration. Om P4 STOPs före migration
körts finns inga nummer-kollisioner. Vid flera migrationer i samma
sprint: första committad = lägre nummer.

---

## Fas P1 — T3.e: Precis RQ-invalidation för depreciation-hooks

**Estimat:** 0.5 SP design + 1–1.5 SP implementation. Totalt ~2 SP.

**Status:** Implementerbar direkt. Ingen extern blockerare.

### Kontext

Fem hooks i [hooks.ts:1007-1048](src/renderer/lib/hooks.ts:1007) använder
`{ invalidateAll: true }`:

- `useCreateFixedAsset` (line 1007)
- `useUpdateFixedAsset` (line 1014)
- `useDisposeFixedAsset` (line 1021)
- `useDeleteFixedAsset` (line 1034)
- `useExecuteDepreciationPeriod` (line 1041)

`invalidateAll: true` är överdrivet — dashboard-summor, BR/RR, IB och
FY-listor invalideras vid varje depreciation-mutation även om de
knappast påverkas. Det ger onödiga network round-trips och
re-render-cascades.

### Leverabler

**1. Nya query-keys i [query-keys.ts](src/renderer/lib/query-keys.ts):**

```ts
// === Fixed Assets / Depreciation (extended) ===
depreciationSchedule: (assetId: number) =>
  ['depreciation-schedule', assetId] as const,
allDepreciationSchedules: () => ['depreciation-schedule'] as const,
```

**2. Per-hook invalidation-matris.** Pattern: byt `invalidateAll: true`
mot `invalidate: [...]` (fältet heter `invalidate`, verifierat i
pre-flight):

| Hook | Invaliderade keys |
|---|---|
| `useCreateFixedAsset` | `[allFixedAssets()]` |
| `useUpdateFixedAsset` | `[allFixedAssets(), fixedAsset(id), allDepreciationSchedules()]` |
| `useExecuteDepreciationPeriod` | `[allFixedAssets(), allDepreciationSchedules(), allDashboard(), incomeStatement(fyId), balanceSheet(fyId), allManualEntries()]` |
| `useDisposeFixedAsset` | `[allFixedAssets(), fixedAsset(id), allDashboard(), incomeStatement(fyId), balanceSheet(fyId), allManualEntries()]` |
| `useDeleteFixedAsset` | `[allFixedAssets()]` |

Motivering:
- **Execute + Dispose** skapar journal-entries (E-serien per M151) och
  påverkar både RR och BR → invalidera dashboard + income + balance +
  manual-entries (ny schedule visas i verifikationslistan).
- **Update** påverkar bara schedule-kalkyl (om nyttjandetid ändras
  pre-execution), inte dashboard.
- **Create + Delete** påverkar bara asset-listan.

**3. Regressionstester (minst 5 nya):**
- Dashboard-summa uppdateras efter `executeDepreciationPeriod`
- BR/RR uppdateras efter `executeDepreciationPeriod`
- BR/RR uppdateras efter `disposeFixedAsset`
- Asset-detail-view uppdateras efter `updateFixedAsset`
- Andra query-keys (invoices, expenses, counterparties) invalideras
  INTE efter depreciation-mutation (negativt test)

### Acceptance P1

- 5 hooks migrerade från `invalidateAll: true` → `invalidate: [...]`
- 2 nya query-key-factories (`depreciationSchedule`, `allDepreciationSchedules`)
- 5+ nya tester (4 positiva + 1 negativt)
- `allDepreciationSchedules()` används konsekvent när schedules
  påverkas
- Ingen ny IPC-kanal, ingen migration
- Bodyguard: `grep -rn 'invalidateAll: true' src/renderer/lib/hooks.ts`
  returnerar 0 depreciation-träffar efter sprinten (övriga 15+
  callsites utanför scope)
- Baseline: 2494 + 5 = **≥ 2499 vitest** efter P1

### STOP-villkor P1

- Om invalidation-matrisen visar sig missa en kritisk query (t.ex.
  `cashFlow(fyId)`) → utvidga matrisen inom scope. Om >3 nya keys
  krävs utöver listan → STOP, eskalera design.

---

## Fas P2 — T3.b: Batch-unmatch

**Estimat:** 0.5 SP UX + 2–3 SP implementation. Totalt ~3 SP.

**Status:** Implementerbar efter UX-beslut. UX-beslut tas inom fasen.

### Kontext

Sprint A / S58 F66-e lade till `unmatchBankTransaction` för enskilda
matchningar. Batch-payment-matchningar blockeras med
`BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED` (M154). Se
[bank-unmatch-service.ts](src/main/services/bank/bank-unmatch-service.ts)
för nuvarande guard.

### Scope-lås: Alt A (hela batchen)

**Inga andra alternativ diskuteras i Sprint F.** Alt B/C (partial-
unmatch inom batch) kräver ny domän-fråga om bank-fee-fördelning (M126
säger batch-level utan proportion) — eskaleras till separat sprint med
eget ADR.

Alt A-semantik:
- Återställer **alla** payments i batchen via korrigeringsverifikat
  (M154 per-payment)
- Raderar alla reconciliation + payment-rader
- Korrigerar bank-fee-verifikatet (batch-level per M126)
- Sätter alla `bank_transactions.reconciliation_status='unmatched'`
- Markerar `payment_batches.status='cancelled'`
- pain.001-exportfilen: **ingen** automatisk åtgärd. Pengarna har
  redan flyttats i banken — ångringen är en bokförings-reversering,
  inte ett bank-kommando. Användaren behöver själv avgöra om
  leverantör/kund ska kontaktas för återbetalning.

### Leverabler

**1. Ny service-funktion `unmatchBankBatch`.**
[bank-unmatch-service.ts](src/main/services/bank/bank-unmatch-service.ts)
— `unmatchBankBatch(db, batchId)`:

- Yttre `db.transaction()` — hela operationen atomär; partial-failure
  → rollback
- Hämta batch via `SELECT * FROM payment_batches WHERE id=?`
- Dispatcha per `batch_type` (M146 polymorfism):
  - `'invoice'` → iterera `invoice_payments WHERE payment_batch_id=?`
  - `'expense'` → iterera `expense_payments WHERE payment_batch_id=?`
- För varje payment: anropa intern `_unmatchPaymentTx` (extrahera
  gemensam logik från existerande `unmatchBankTransaction`)
- Korrigera bank-fee-verifikatet (source_type='auto_bank_fee',
  source_reference='batch:{batch_id}') via
  [correction-service.ts](src/main/services/correction-service.ts)
- Uppdatera `payment_batches.status='cancelled'`

**Chronology-hantering (M142):** Alla N+1 korrigeringsverifikat
(N payment-korrigeringar + 1 bank-fee-korrigering) skapas i samma
transaktion och **måste ha icke-minskande datum inom C-serien**. Regel:
- Datum för varje korrigering = `MAX(today, lastCSeriesDateInFy)` —
  använd `getNow()`-helpern (M150)
- Alla korrigeringar inom batch-unmatch får **samma datum** (OK per
  M142, "samma dag är tillåtet")
- Chronology-check körs **en gång på batch-nivå** före loopen (M114-
  mönstret), sedan `skipChronologyCheck=true` per korrigering. Kräver
  utvidgning av `createCorrectionEntry` med samma skip-flagga som
  `_payInvoiceTx`/`_payExpenseTx` har, **ELLER** manuell pre-check +
  direkt-anrop till intern `_createCorrectionTx` om sådan existerar.
  **Pre-flight i fas-start:** grep `correction-service.ts` efter
  befintlig skip-flagga. Om saknas → lägg till (liten utvidgning) eller
  gör alla korrigeringar med samma datum = chronology passerar
  naturligt (ingen skip-flagga behövs).

**2. Borttagning av `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`-guard.**
Guardet ersätts med anrop till `unmatchBankBatch`. ErrorCode behålls
i `ErrorCode`-enum för framtida Alt B-fall (där enskild rad i batch
fortfarande blockeras).

**3. Ny IPC-kanal `bank-statement:unmatch-batch`.** M144-compliant:
- Zod-schema `UnmatchBankBatchSchema` i ipc-schemas.ts
- Handler via `wrapIpcHandler`
- `IpcResult<void>` returtyp

**4. UI: knapp + bekräftelsedialog.** I
[BankReconciliationView](src/renderer/components/bank/) — visa
"Ångra hela batchen"-knapp på batch-matchningar. ConfirmDialog (per
M133, role="alertdialog") med **exakt följande varningstext**:

> **Ångra hela betalningsbatchen?**
>
> Detta skapar ett korrigeringsverifikat (C-serien) som reverserar
> bokföringen för alla {N} betalningar i batchen samt batchens
> bankavgift.
>
> **Viktigt:**
> - Pengarna har redan flyttats i banken. Denna ångring påverkar
>   **endast bokföringen** — den skickar inget nytt bank-kommando.
> - Exportfilen (pain.001) för denna batch är redan skickad. Du
>   behöver själv kontakta {mottagare/avsändare} om pengarna ska
>   återbetalas.
> - Ångringen kan inte göras ogjord — den är ett
>   korrigeringsverifikat enligt M140.
>
> [Avbryt] [Ångra hela batchen]

`{N}` och `{mottagare/avsändare}` interpoleras av React (batch-type
bestämmer text: "leverantören" för expense-batch, "kunden" för
invoice-batch).

**5. Tester (minst 8 nya):**
- Happy path: 2-rads batch unmatchas → båda payments raderade,
  bank-fee-korrigeringsverifikat skapat, batch.status='cancelled'
- 3-rads batch unmatchas
- Invoice-batch + expense-batch (separata tester, M146-symmetri)
- Ny match efter unmatch-batch fungerar (M140 per payment-JE)
- Korrigeringsverifikat har korrekt cross-reference (M139)
- Chronology-check (M142) för korrigeringsverifikat
- Dubbel-unmatch av samma batch blockeras med `ALREADY_UNMATCHED`
- E2E: UI-flöde från match → unmatch → re-match

### Acceptance P2

- Alt A-implementation enligt ovan
- `unmatchBankBatch` polymorf över batch_type (M146)
- UI-knapp + ConfirmDialog med exakt varningstext
- Alla payments i batchen korrigeras via C-serie-JE (chronology OK)
- Alla 8 tester gröna
- `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED` behålls i enum, används
  längre ej av unmatch-path (men kan tänkas returneras vid framtida
  partial-unmatch-Alt-B)
- Baseline: ≥ 2499 + 8 = **≥ 2507 vitest** efter P2

### STOP-villkor P2

- Om chronology-hantering kräver nytt skip-flag-API i correction-
  service + >3 nya callsite-ändringar → STOP, eskalera
- Om bank-fee-korrigering kräver ny M-princip → STOP, eskalera
- Om partial-unmatch-diskussion dyker upp från stakeholder → HÄNVISA
  till scope-lås; noll diskussion, noll implementation, eskalera som
  separat Sprint G-item

---

## Fas P3 — T3.a: F62-e ADR (DOKUMENTATION ENDAST)

**Estimat:** 1–2 SP ADR. Implementation (3–5 SP) eskaleras till Sprint H.

**Status:** Implementation blockerad på revisor-samråd. ADR skrivs i
Sprint F som underlag.

### Kontext

`updateFixedAsset` är pristine-guardad efter första schedule-
exekvering. För att ändra nyttjandetid, restvärde eller
anskaffningsvärde efter exekvering krävs korrigeringsverifikat
(C-serie per M140) — men öppna domän-frågor:

1. **Retroaktiv balans eller framtida?** Justerar korrigeringen
   historiska perioder eller bara framtida?
2. **Partial-executed + disposal?** Om 4 av 10 schedules körda, sedan
   tillgången avyttras — hur tolkas en retroaktiv ändring?
3. **Svensk praxis?** Vad säger K2/K3-regelverket om retroaktiv
   ändring av avskrivningsbas?
4. **Audit-trail?** Hur visas ändringshistorik i asset-view?

### Leverabler

**ADR-fil: `docs/adr/002-asset-edit-after-execution.md`**

Struktur (per M140 + ADR 001 mall):

1. **Status:** Draft (awaits revisor-samråd)
2. **Kontext:** Ovanstående fyra frågor
3. **Beslutsalternativ:**
   - **Alt A — Bara framtida perioder:** Ny nyttjandetid/restvärde
     appliceras från nästa oexekverad period. Historiska schedules
     orörda. Korrigeringsverifikat ej krävs.
   - **Alt B — Retroaktiv justering via C-serie:** Omberäknar ack.
     avskr + ack. restvärde tillbaka till anskaffning. C-serie-JE
     justerar avskrivningskonton per period.
   - **Alt C — Hybrid:** Små ändringar (≤10% diff) → framtida.
     Stora → retroaktiv med C-serie.
4. **Rekommendation (draft):** Alt A för MVP. Alt B som framtida
   utökning efter revisor-feedback.
5. **M-princip-kandidat:** M155 (draft) — "Asset-edit efter första
   schedule-exekvering: framtida perioder, aldrig retroaktiv (default)"
6. **Open questions for revisor:**
   - Svensk BFL/K2-praxis vid ändring av avskrivningsbas?
   - Måste ändringen motiveras i årsredovisning?
   - Hur skiljer man mellan "rättelse av fel" och "reviderad
     bedömning"?
   - **Alt B + stängd period:** Om historiska schedules ligger i
     räkenskapsår som är stängda (`accounting_periods.is_closed = 1`
     per M93), kan C-serie-korrigeringsverifikat ens bokföras i den
     perioden? Nuvarande trigger `trg_check_period_on_booking`
     blockerar troligen — verifiera före sprinten genom att läsa
     trigger-koden. Om blockerad → Alt B är de facto omöjlig utan
     period-reopening, vilket är revisor-beslut i sig.
   - **Framtida disposal-interaktion:** Om tillgången avyttrats (har
     disposal-JE), är asset-edit tillåten? Eller måste disposal
     ångras först?
7. **Implementation-sketchmock:** pseudokod för Alt A (för att
   validera att ADR är genomförbar)

**Sprint H-prompt-skelett: `docs/sprint-h-prompt.md`** (ny fil)

Skeleton med TODO-markeringar för:
- Lösa ADR:ns open questions via revisor-samråd
- Implementation-specifikation av valt alternativ
- Test-matris
- M-princip-promotion

### Acceptance P3

- ADR 002 skriven och committad
- Sprint H-prompt-skelett skapat
- Ingen kod ändrad
- Memory uppdaterat: "ADR 002 draft — awaits revisor"

### STOP-villkor P3

- ADR växer över 500 rader → STOP, splitta till flera ADR-filer
- Revisor-samråd kan inte lösas inom sprint → ADR stannar som draft,
  det är OK

---

## Fas P4 — T3.c: Konfigurerbara BkTxCd-mappningar (reducerat scope)

**Estimat:** 3–4 SP. Scope reducerat från ursprungligt ~5 SP efter
pre-flight-beslut: **ingen IBAN-auto-dispatch i Sprint F**. Endast
`'*'`-fallback-mappningar (globala per installation).

**Status:** Implementerbar. IBAN-prefix-logik eskalerad till Sprint G
där BIC-mappnings-research hör hemma.

### Kontext

[bank-fee-classifier.ts](src/main/services/bank/bank-fee-classifier.ts)
har hårdkodad whitelist för subfamily-koder (`'CHRG'` → bank_fee,
`'INTR'` → interest). För att supportera bankspecifika koder (t.ex.
Swedbank använder ibland andra subfamily-koder för samma semantiska
avgift) behövs en konfigurerbar tabell.

**M153-kritiskt:** Deterministisk scoring kräver att mappningarna är
reproducerbara per tidpunkt. DB-tabell + cache invaliderat vid
upsert. Ingen randomness.

### Scope-lås

**INGEN IBAN-prefix-parsning i Sprint F.** Alla mappningar gäller
globalt per installation (per företag räcker eftersom en databas = en
företagsinstans i denna single-user-app). Detta eliminerar:
- BIC-mappnings-research
- IBAN-kod-position-5–8-parsing
- Prioritetsregler mellan specifik vs fallback-match

Om multi-bank-support behövs i framtiden: Sprint G lägger till
`iban_bank_code`-kolumn + prioritets-match. Scope för Sprint F är
**reglerna är globala per installation**.

### Leverabler

**1. Migration 042 — `bank_tx_code_mappings`-tabell.**

Ny tabell utan inkommande FK-referenser → M122 är inte tillämpbar
(M122 gäller table-recreate på tabeller med inkommande FK, inte
nya tabeller). Standard-migration räcker.

```sql
CREATE TABLE bank_tx_code_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,              -- ISO 20022 BkTxCd Domain
  family TEXT NOT NULL,              -- ISO 20022 BkTxCd Family
  subfamily TEXT NOT NULL,           -- ISO 20022 BkTxCd SubFamily
  classification TEXT NOT NULL,      -- 'bank_fee' | 'interest' | 'ignore'
  account_number TEXT,               -- valfritt: kontohint för bokning
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (domain, family, subfamily),
  CHECK (classification IN ('bank_fee', 'interest', 'ignore'))
);
```

Seed-data (motsvarar nuvarande hårdkodad whitelist):

```sql
INSERT INTO bank_tx_code_mappings
  (domain, family, subfamily, classification) VALUES
  ('PMNT', 'CCRD', 'CHRG', 'bank_fee'),
  ('PMNT', 'CCRD', 'INTR', 'interest');
```

**2. Uppdatera bank-fee-classifier.ts.**

- Läser mappningar från DB istället för hårdkodad konstant
- Cache-lager: Map populeras vid första anrop per db-instans, invalideras
  vid upsert/delete via explicit `invalidateClassifierCache(db)`-export
  som IPC-handlers anropar efter mutation
- M153-grep-check: ingen ny randomness införd (check:m153 körs i CI)

**3. 3 nya IPC-kanaler (M144-compliant):**
- `bank-tx-mapping:list` — read-all
- `bank-tx-mapping:upsert` — create/update (UNIQUE fångar dubletter
  per M124)
- `bank-tx-mapping:delete` — remove by id

Alla via `wrapIpcHandler` med Zod-scheman.

**4. UI — sub-page under Settings.**

`/settings/bank-tx-mappings` — tabell + lägg-till-dialog. Kolumner:
Domain | Family | SubFamily | Classification | Konto | [Radera]. Noll
IBAN-kolumn.

**5. Tester (minst 10 nya):**
- Migration 042 skapar tabellen
- Seed-data läses från DB (inte hårdkodad konstant)
- Classifier ger samma resultat över två anrop (M153-deterministism)
- Classifier-cache invalideras korrekt efter upsert
- IPC-kanaler validerar input (Zod-miss → `VALIDATION_ERROR`)
- UNIQUE-constraint fångar duplicerade (domain, family, subfamily)
  → `DUPLICATE_MAPPING` via `mapUniqueConstraintError` (M124)
- Delete oexisterande id → `NOT_FOUND`
- Upsert med ogiltig classification → CHECK-constraint blockerar
- Classifier fallback när ingen mappning finns → returnerar `null`
  (okänd kod, klassificeras inte automatiskt)
- E2E: lägg till mappning via UI → verifiera att classifier använder
  den i nästa import

### Acceptance P4

- Migration 042 (PRAGMA 41 → 42)
- Tabell + seed-data
- Classifier migrerad till DB-läsning med cache-invalidering
- 3 nya IPC-kanaler
- Settings-page (noll IBAN-UI)
- 10+ tester
- `check:m153` grönt (scoring deterministisk)
- Baseline: ≥ 2507 + 10 = **≥ 2517 vitest** efter P4

### STOP-villkor P4

- Om cache-invalidering kräver större refaktor av classifier-API
  (andra callsites påverkas) → STOP, eskalera
- Om Settings-page-integration kräver ny routing eller sidebar-
  ändring → leverera enbart service + IPC + tester, UI eskaleras
- Om stakeholder föreslår IBAN-support mitt i fasen → HÄNVISA till
  scope-lås, inga diskussioner

---

## Fas P5 — T3.g: F49-c keyboard-navigation UX-spec (DOKUMENTATION ENDAST)

**Estimat:** 0.5 SP UX-spec. Implementation eskaleras.

**Status:** Implementation blockerad på UX-spec. Spec skrivs i
Sprint F.

### Kontext

[s22b-f49-strategy.md:381-393](docs/s22b-f49-strategy.md) listar
"Layout-refaktor för keyboard-navigation", "List/table semantik" och
"Skip-links" som explicita non-goals för F49. F49-c nämns som
reservslot i [s22c-voiceover-notes.md](docs/s22c-voiceover-notes.md)
men har ingen scope-definition.

### Leverabler

**1. UX-spec-dokument: `docs/f49c-keyboard-nav-spec.md`**

Struktur:

1. **Scope-definition.** Vilka ytor ingår:
   - InvoiceList + ExpenseList (list-rader, bulk-actions)
   - ManualEntryForm, InvoiceForm, ExpenseForm (form-flow)
   - Bank-reconciliation-dialoger (match-selection)
   - Dashboard (widget-navigation)

2. **Tab-ordning per yta.** Explicit lista:
   - Header → filter-knappar → list-rader → pagination → footer
   - Radix-dialoger: focus-trap, Escape stänger, Tab roterar
   - Bulk-action-bar: visas när rad selekterad, Tab går till "Ångra" →
     "Betala" → "Exportera PDF"

3. **Enter-aktivering på list-rader.** Ska Enter på rad = klick på
   rad = navigera till detail-view? Beslut + motivering.

4. **Arrow-keys i tabeller.** Tre alternativ:
   - A. Ingen arrow-key-support (nuvarande)
   - B. Arrow ↑↓ byter fokus-rad (roving-tabindex)
   - C. Full grid-mönster (Arrow i alla riktningar + Home/End/PgUp/PgDn)

   Rekommendation: **Alt B för list-vyer, ingen grid.** Motivering:
   grid-mönster kräver ombyggnad av Radix-tabeller som inte är
   designade för det. Alt B ger tangentbord-användare nytta utan
   full refaktor.

5. **Skip-links.** Tre kandidater:
   - Hoppa till huvudinnehåll
   - Hoppa till navigering
   - Hoppa till bulk-action-bar (när aktiv)

6. **Focus-trap-edge-cases i Radix.** Dokumentera kända issues:
   - `role="alertdialog"` fångar fokus korrekt men kräver att
     förstafokus är "Avbryt" eller primär-knapp — vad passar bäst?
   - Nested dialoger (Confirm i Dialog) — fokus återvänder korrekt?

7. **M-princip-kandidat:** M156 (draft) — "Keyboard-navigation-
   kontrakt: roving-tabindex för list-rader, ingen grid-tabell utan
   eng-review".

8. **Sprint-split.** F49-c implementerat i ~3 sprintar:
   - F49-c1: Skip-links + Tab-ordning audit (0.5 sprint)
   - F49-c2: Roving-tabindex för InvoiceList + ExpenseList (1 sprint)
   - F49-c3: Dialog-focus-trap-refactors (0.5 sprint)

**2. Uppdatera `docs/s22b-f49-strategy.md:381-393`** — flytta
keyboard-nav från "non-goal" till "out-of-scope-F49, in-scope-F49-c
per spec", länka till nya spec-filen.

### Acceptance P5

- UX-spec committad
- s22b-f49-strategy.md uppdaterat
- Sprint-split-plan (F49-c1, F49-c2, F49-c3)
- Ingen kod ändrad
- Memory uppdaterat: "F49-c spec klar, väntar på sprint-prioritering"

### STOP-villkor P5

- Spec-yta utvidgas utöver ovanstående 4 ytor → splitta per yta
  (InvoiceList, forms, dialogs separat) i separata spec-filer
- Alt A/B/C-beslut för arrow-keys kräver användartest → skriv spec
  som "Alt B rekommenderas, bekräftas i F49-c2-planning"

---

## Fas P6 — T3.d: camt.054 parser (Path A: pseudo-statement, ingen migration)

**Estimat:** 2–3 SP för camt.054. MT940 + BGC eskaleras till Sprint G/H.

**Status:** Implementerbar via Path A efter pre-flight-fynd.

### Pre-flight-beslut

`bank_statements.opening_balance_ore` är `NOT NULL` och
`bank_transactions.bank_statement_id` är `NOT NULL` (verifierat).
camt.054 saknar balanssummor per spec. Två paths:

- **Path A (default):** Skapa pseudo-statement per camt.054-fil med
  `opening_balance_ore=0`, `closing_balance_ore=0`,
  `statement_number='CAMT054-{date}'`, `source_format='camt.054'`.
  Transaktioner länkas till pseudo-statement som vanligt. **Ingen
  migration.** Dokumenteras som känd semantisk kompromiss.
- **Path B (eskalerat):** Migration 043 gör balans-kolumnerna +
  `bank_statement_id` nullable. Refactor av service + tests. Större
  scope, eskaleras till Sprint G där ADR 003 dokumenterar
  camt.054-arkitektur.

**Sprint F använder Path A.**

### Motivering för 1-av-3-scope

Memory anger H2 2026 för T3.d. Att klara alla tre format i en fas är
orealistiskt (6–9 SP totalt). camt.054 prioriteras eftersom:
- Den mest liknar existerande camt.053 → återanvänder parser-
  arkitektur + M152-sign-konvention
- Transaktionsnivå-notifiering är värdefull för snabbare
  reconciliation-flöden (vet om en faktura betald samma dag)
- MT940 är SWIFT-legacy; BGC är svenska-specifikt och har egen
  fil-struktur

### Leverabler

**1. Ny parser: `src/main/services/bank/camt054-parser.ts`**

- Återanvänder XML-parse-infrastruktur från
  [camt053-parser.ts](src/main/services/bank/camt053-parser.ts)
- camt.054 skiljer sig från camt.053 i:
  - `Ntfctn` istället för `Stmt` som rotelement
  - Balanssummor saknas (det är bara notification, inte kontoutdrag)
  - `CdtDbtInd` fungerar identiskt (M152)
- Exporterar `parseCamt054(xmlString)` med samma return-type som
  camt.053-parsern, men med `openingBalance=null`, `closingBalance=null`

**2. Import-service-integration (Path A).**

[bank-statement-service.ts](src/main/services/bank/bank-statement-service.ts)
`importBankStatement` tar redan `{ format, content }`. Lägg till
`format === 'camt.054'`-branch:

- Anropa `parseCamt054`
- Skapa pseudo-statement-rad:
  - `statement_number='CAMT054-{yyyy-MM-dd}-{hash}'`
  - `opening_balance_ore=0`, `closing_balance_ore=0`
  - `source_format='camt.054'`
  - `statement_date` = booking_date för första transaktionen
- Länka TX-rader till pseudo-statement som vanligt

**Kod-kommentar (obligatorisk) på pseudo-statement-raden:**
```ts
// camt.054 saknar balanssummor per ISO 20022-spec. Pseudo-statement
// med opening=0, closing=0 är en semantisk kompromiss för att
// undvika migration av NOT NULL-kolumner. Se Sprint F P6 / sprint-f-prompt.md.
// Framtida rensning: ADR 003 camt.054-arkitektur (eskalerat).
```

**3. IPC-schema-uppdatering.** `BankStatementFormat`-enum utökas:
`'camt.053' | 'camt.054'`.

**4. UI — format-dropdown.**
[BankStatementImport](src/renderer/components/bank/) — dropdown för
format. camt.053 default. camt.054-val visar info-tooltip:
"camt.054 är transaktionsnotifiering utan balans — balansrapport
måste importeras separat via camt.053."

**5. Tester (minst 6 nya):**
- Parser: minimal camt.054 → 1 transaktion korrekt
- Parser: multi-entry camt.054 → flera transaktioner
- Parser: positiva + negativa amounts (M152)
- Service: import av camt.054 → pseudo-statement + bank_transactions
  rader skapade; `opening_balance_ore=0`, `source_format='camt.054'`
- Service: blandad import (camt.053 + camt.054 för samma konto i
  följd) → båda importerade, separata statement-rader
- E2E: välja format camt.054 i import-dialog → lyckad import + visar
  transaktioner i reconciliation-view

### Acceptance P6

- camt054-parser.ts skapad + testad
- Service-integration Path A (pseudo-statement, ingen migration)
- IPC-schema utökat
- UI-dropdown med info-tooltip
- 6+ tester
- Kod-kommentar om pseudo-statement-kompromiss finns på rätt ställe
- MT940 + BGC dokumenterade som Sprint G/H-kandidater i summary
- Baseline: ≥ 2517 + 6 = **≥ 2523 vitest** efter P6

### STOP-villkor P6

- Om pseudo-statement-approach visar sig bryta existerande queries
  (t.ex. reconciliation-matching som antar opening+closing > 0) →
  STOP, Path B eskaleras till Sprint G
- Om camt.054 XSD-validering avviker så mycket från camt.053 att
  parser-arkitektur måste rivas upp → STOP, fasen reduceras till
  "dokumentera arkitektur-gap", implementation eskaleras

---

## Bodyguards (gäller alla faser)

- PRAGMA `user_version` — P4 + P6 får eventuellt höja (42, 43)
  ENDAST om M122-audit genomförd och dokumenterad
- **Inga nya M-principer utan eng-review.** P3 + P5 får föreslå
  M-principer i sina respektive ADR/spec, men promoterar dem inte
  — det är en separat Sprint G-diskussion.
- **Inga nya ErrorCodes utan eng-review.** P2 får utvidga
  `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`-semantik, P4 får inte lägga
  till nya.
- **Publik yta:** nya IPC-kanaler i P2 + P4 + P6 måste följa M144
  (wrapIpcHandler + IpcResult).
- **M150 + M153** — alla nya services använder `getNow()` och
  deterministisk scoring. Kör `check:m150` (om finns, annars grep)
  och `check:m153` per fas.
- **M133 + M133-ast** — UI-ändringar i P2 + P4 + P6 får inte införa
  nya `axeCheck: false` utan `// M133 exempt`-markering.
- **Lint-gate:** `npm run check:lint-new` på alla nya/ändrade filer.
  Baseline-debt utanför scope.

---

## Acceptance per fas + baseline-spårning

Varje fas har egen acceptance-sektion ovan. Sprint F-leveransen är
framgångsrik om **minst P1 + P3 + P5 levererats** (low-risk nucleus).
P2, P4, P6 är stretch goals — det är OK att eskalera.

**Test-baseline-delta per fas (kumulativ):**

| Efter fas | Vitest minimum | Δ från förra |
|---|---|---|
| Pre-F | 2494 | — |
| P1 | ≥ 2499 | +5 |
| P2 | ≥ 2507 | +8 |
| P3 | ≥ 2507 | 0 (doc-only) |
| P4 | ≥ 2517 | +10 |
| P5 | ≥ 2517 | 0 (doc-only) |
| P6 | ≥ 2523 | +6 |

**Full leverans:** 2523 vitest (+29 från 2494). Nucleus-endast:
2499 vitest (+5). Summary noterar faktiskt utfall vs estimat.

**Playwright-delta:** Varje stretch-fas (P2/P4/P6) har 1 E2E →
potentiellt 42 → 45 specfiler. Nucleus-only: 42 oförändrat.

**PRAGMA user_version:** 41 (nucleus) eller 42 (om P4 levererar
migration 042). Aldrig 43 — P6 Path A har ingen migration.

---

## Deliverables

**Kod:**
- P1: hooks.ts + query-keys.ts (ingen `useIpcMutation`-ändring per
  pre-flight)
- P2: bank-unmatch-service.ts + ipc-schemas + handlers + UI
- P3: `docs/adr/002-asset-edit-after-execution.md` + sprint-h-skelett
- P4: migration 042 + bank-fee-classifier + 3 IPC-kanaler + UI (ingen
  IBAN-logik per scope-lås)
- P5: `docs/f49c-keyboard-nav-spec.md` + s22b-f49-strategy-uppdatering
- P6: camt054-parser.ts + service-integration Path A + UI (ingen
  migration per pre-flight)

**Tester:**
- P1: 5+ nya
- P2: 8+ nya
- P4: 10+ nya
- P6: 6+ nya
- Totalt minst ~30 nya tester vid full leverans

**Docs:**
- `docs/sprint-f-summary.md` (post-sprint)
- ADR 002 (P3)
- F49-c UX-spec (P5)
- Sprint H-skelett (P3)

**Memory:**
- `project_sprint_state.md` — "Sprint F KLAR (P1+P2+P3+P5), P4+P6
  levererade/eskalerade per utfall"

---

## Faskörningsordning (rekommenderad)

**Dag 1 förmiddag (doc-writing, låg bandbredd):** P3 + P5
- P3 ADR-writing (1–2 SP) — öppen-fråga-lista till revisor
- P5 UX-spec-writing (0.5 SP) — 4 ytor, Alt B för arrow-keys

Doc-writing först eftersom:
1. Båda är dokumentations-leveranser utan exekveringsrisk
2. Flyttar över blockerare-diskussioner till text, inte kod
3. Om resten av sprinten brinner ner har nucleus redan skeppat

**Dag 1 eftermiddag (implementation, hög bandbredd):** P1
- P1 är välskopad (2 SP) och implementationen är mekanisk
- Efter dag 1: nucleus (P1+P3+P5) klar, Sprint F kan redan committa
  som "delvis klar" om stop-villkor träffar senare

**Dag 2 (stretch #1):** P2 (Alt A)
- Scope-lås redan etablerat, ingen UX-diskussion första timme
- Implementation + tester

**Dag 3 (stretch #2):** P4 (reducerat scope)
- Migration + service + IPC + UI
- Stretch-risken är Settings-page-integration

**Dag 4 (stretch #3):** P6 (Path A)
- Parser-återanvändning från camt053 → mekanisk
- Stretch-risken är pseudo-statement-interaktion med reconciliation

**Dag 5:** Summary + memory-update + commit-städning + eventuella
stretch-items som blev försenade.

---

## Exit-kriterium för Sprint F

- Minst P1 + P3 + P5 i main (low-risk nucleus)
- Varje levererad fas har gröna tester + check:m133 + check:m150 +
  check:m153 + typecheck
- `docs/sprint-f-summary.md` listar per-fas-utfall
- Eskalerade faser dokumenterade i Sprint G-prompt-skelett
- Ingen regression i baseline-tester (2494 vitest minimum)
- PRAGMA `user_version` är 41, 42 eller 43 beroende på P4/P6-utfall

---

## Tidsuppskattning

- **Best-case** (alla 6 levereras): 14–22 SP, ~3–4 veckor solo
- **Realistiskt** (P1+P2+P3+P5 levereras, P4+P6 delvis/eskalerat):
  10–14 SP, ~2 veckor
- **Nucleus** (P1+P3+P5): 3–4 SP, ~3–5 dagar

Anpassa körningsordning efter tillgänglig tid. Prompten är designad
för att kunna stoppas vid valfri fas-gräns utan att lämna halvklara
leveranser.
