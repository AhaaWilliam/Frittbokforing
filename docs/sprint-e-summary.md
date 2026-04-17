# Sprint E — Backlog-cleanup: WONTFIX + filter-URL-state

**Datum:** 2026-04-17
**Tema:** Tiered cleanup-sprint. T1 (dokumentation) + T2 (scope-säkert) +
T3 (eskalering). Noll migrationer, noll nya M-principer, noll nya IPC-kanaler.

## Testbaslinje

| Mätvärde | Före (SD) | Efter (SE) | Δ |
|---|---|---|---|
| Vitest | 2475 | 2494 | +19 |
| Testfiler | 246 | 249 | +3 |
| Playwright specfiler | 41 | 42 | +1 |
| Playwright `test()`-kallor | 66 | 67 | +1 |
| Full E2E | 66p/0f | 67p/0f | +1p |
| PRAGMA user_version | 41 | 41 | 0 |
| Nya IPC-kanaler | — | — | 0 |
| Nya M-principer | — | — | 0 |
| Nya migrationer | — | — | 0 |

Notera: Sprint D-summary angav **65 Playwright-specfiler, 102 test()**.
Post-Sprint D-verifiering visade **41 specfiler, 66 test()** — Sprint D-talen
var felaktiga (mätfel i deras baseline-tabell, inte förlust av tester). Sprint
E:s baseline är verifierad via `find` + grep, se § Pre-flight.

## Pre-flight-resultat

| Check | Kommando | Resultat | Beslut |
|---|---|---|---|
| Sort-state i UI | `grep -rE "sortBy\|sortOrder\|sort_by\|sort_order\|orderBy\|sortKey\|sortField" src/renderer/components/{invoices,expenses} --include="*.tsx"` | 0 träffar | **T2.b skippas** |
| F49-c scope-definition | `grep -rn "F49-c\|keyboard-nav\|keyboard navigation" docs/ memory/ CLAUDE.md` | Hittat som omnämnande i [s22c-voiceover-notes.md:53-64](s22c-voiceover-notes.md) och [s22b-f49-strategy.md:388](s22b-f49-strategy.md). [s22b-f49-strategy.md:381-393](s22b-f49-strategy.md) listar "Layout-refaktor för keyboard-navigation" som **non-goal** för F49. Ingen konkret scope-definition för F49-c finns. | **T2.c skippas** |
| Latent IpcResult-mönster | `grep -rn "return err as IpcResult" src/main/services --include="*.ts"` | 1 träff: [bank-statement-service.ts:235](src/main/services/bank/bank-statement-service.ts:235) — dokumenterad som WONTFIX i T1.a | OK |

## Levererat

### T1.a — WONTFIX-dokumentation av latent IpcResult-mönster

[bank-statement-service.ts:229-233](src/main/services/bank/bank-statement-service.ts:229)
har nu dokumenterande kommentar:

```ts
// Sprint E T1.a — Latent / WONTFIX: importBankStatement returnerar alla
// inre fel som kompletta IpcResult-objekt från sin transaction, så denna
// gren är oreachable idag. Om en framtida callpath börjar kasta
// strukturerat {code,error} från transactionen, applicera F7f-paritet
// (se bank-match-service.ts) och lägg till regressionstest.
```

Beslutsmotivering: Koden är oreachable i nuvarande flöden
([bank-statement-service.ts:97-171](src/main/services/bank/bank-statement-service.ts:97)
fångar alla inre fel som kompletta `IpcResult`-objekt). Sprint D-summary
skrev redan *"Kan fixas för typ-säkerhet men har ingen observerbar effekt.
Ej scope för Sprint D."* Att fixa defense-in-depth utan reachability-test
lägger kodvariant utan värde.

Ingen test skriven. Kommentaren är självdokumenterande och M133-ast-
checken förblir orörd.

### T2.a — Filter-state i URL (InvoiceList + ExpenseList)

Ny hook [use-filter-param.ts](src/renderer/lib/use-filter-param.ts) med
whitelist-validering av URL-värden. Adopterad i
[InvoiceList.tsx:76-79](src/renderer/components/invoices/InvoiceList.tsx:76)
och [ExpenseList.tsx:71-74](src/renderer/components/expenses/ExpenseList.tsx:71).

**Invarianter:**
- `allowedValues` är obligatorisk → ogiltiga URL-värden (t.ex.
  `?invoices_status=xyz`) strippas vid mount
- Andra query-params bevaras intakta vid filter-update
- `setFilter(undefined)` eller `setFilter(defaultValue)` tar bort param
- URL-init triggar **inte** page-reset (`prevFilters`-ref-mönstret
  initialiseras med första render-värdet)
- Lyssnar på `hashchange` för extern sync (back/forward-button)

**Invoice-statusar (4):** `draft | unpaid | paid | overdue`
**Expense-statusar (5):** `draft | unpaid | partial | paid | overdue`

**Tester (19 nya):**
- 11 hook-tester i [use-filter-param.test.ts](tests/renderer/lib/use-filter-param.test.ts)
  (default, URL-init, invalid-strip, setFilter, multi-param preserve,
  hashchange, isolation, defaultValue-roundtrip)
- 4 integration-tester per lista (Invoice + Expense), totalt 8:
  URL-init-aktivering, invalid-värde-strip, klick-på-"Alla", URL-init
  utan page-reset
- 1 E2E: [filter-url-state.spec.ts](tests/e2e/filter-url-state.spec.ts)
  — deep-link → aktiv knapp + klick "Alla" → URL rensas

## Skippat med motivering

### T2.b — Sort-state i URL

**Pre-flight:** 0 träffar på sort-mönster i renderer-komponenterna.

Backend stödjer `sort_by`/`sort_order` i
[expense-service.ts:1099](src/main/services/expense-service.ts:1099) och
[hooks.ts:656](src/renderer/lib/hooks.ts:656) (`useExpenses`), men
InvoiceList/ExpenseList skickar inga sort-parametrar. UI-sort är alltså
inte implementerat.

Framtida UI-sort bör implementeras med URL-state från dag 1 via samma
`useFilterParam`-mönster (eller en `useSortParam`-variant). Ej scope för
Sprint E.

### T2.c — F49-c keyboard-navigation

**Pre-flight:** F49-c nämns som reservslot för framtida A11y-förbättringar
i [s22c-voiceover-notes.md](docs/s22c-voiceover-notes.md) ("öppna F49-c
om detta behövs"), men [s22b-f49-strategy.md:381-393](docs/s22b-f49-strategy.md)
listar explicit "Layout-refaktor för keyboard-navigation", "List/table
semantik" och "Skip-links" som **non-goals för F49**.

Ingen konkret scope-definition finns. Utan spec är risken stor för scope-
creep (Tab → Enter → Arrow-keys → roving-tabindex är en etablerad glidbana).
Eskalerat som T3.g.

## Eskalerat till T3 (dokumenterade, INTE implementerade)

### T3.a — F62-e: Edit av exekverad tillgång via korrigeringsverifikat

Pristine-guard på `updateFixedAsset` efter första schedule-exekvering är
avsiktlig. Att tillåta ändring efter exekvering kräver:
- ADR om korrigerings-semantik (retroaktiv justering eller endast framtida?)
- Revisor-samråd om svensk praxis vid retroaktiv ändring av avskrivningsbas
- Hantering av partial-executed + disposal-scenario

**Estimat:** 1–2 SP ADR + 3–5 SP implementation. ~1 sprint.
**Nästa steg:** Beslut om ADR ska skrivas. Ägare: produktbeslut (William).

### T3.b — Batch-unmatch (F66-e extension)

`unmatchBankTransaction` blockeras för batch-payments med
`BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED` (M154). Batch-unmatch kräver UX-design:
- Hela batchen eller enskilda rader?
- Bank-fee-verifikatet (batch-level per M126) — partial-återställning?
- pain.001-exporten → void eller ny export?
- Ny ErrorCode eller parametriserad `bank-statement:unmatch-transaction`?

**Estimat:** 0.5 SP UX + 2–3 SP implementation. < 1 sprint.
**Nästa steg:** UX-design. Ägare: William för UX-beslut.

### T3.c — Konfigurerbara BkTxCd-mappningar per bank

`bank-fee-classifier.ts` har hårdkodad whitelist. För multi-bank-stöd
(SEB, Handelsbanken, Swedbank) krävs konfig-tabell.

**M153-koppling kritisk:** Deterministisk scoring kräver att mappningarna
är reproducerbara per tidpunkt. **DB-tabell rekommenderas** över
settings-JSON — audit-trail via history, inte filmod-datum.

**Estimat:** 1 SP kartläggning + 3–5 SP implementation. ~1 sprint.
**Nästa steg:** Samla prod-data från test-kunder. Ägare: produktbeslut.

### T3.d — camt.054 / MT940 / BGC-retur-fil (H2 2026)

Ny parser + mappning till `bank_transactions` per format. Memory anger
H2 2026 som tidsram.

**Estimat:** 2–3 SP per format. 6–9 SP totalt.
**Nästa steg:** Prioriteringsbeslut. Ägare: produktbeslut.

### T3.e — Precis RQ-invalidation för depreciation-hooks (ny, från omarbetning)

Fem hooks i [hooks.ts:1020-1058](src/renderer/lib/hooks.ts:1020) använder
`{ invalidateAll: true }` (useCreateFixedAsset, useUpdateFixedAsset,
useDisposeFixedAsset, useDeleteFixedAsset, useExecuteDepreciationPeriod).
Sprint C:s backlog refererade endast `useUpdateFixedAsset`, men cherry-pick
är inkonsistent. Kräver:
- Ny query-key-struktur (`depreciationSchedule(assetId)`,
  `allDepreciationSchedules`, beslut om `allJournalEntries` eller
  `allDashboard`+`incomeStatement`+`balanceSheet`)
- Invalidation-matris per hook
- Regression-tester (dashboard efter execute, BR/RR efter dispose)

**Estimat:** 0.5 SP design + 1–1.5 SP implementation. < 0.5 sprint.
**Nästa steg:** Skriva 1-sidig designdokument för query-key-struktur.
Ägare: William.

### T3.f (conditional) — UI-sort för listor

Skapas endast om framtida pre-flight hittar sort-mönster. Idag: **inte skapat**.

### T3.g — F49-c keyboard-navigation scope-definition

**Vad:** F49-c används som reservslot i [s22c-voiceover-notes.md](docs/s22c-voiceover-notes.md)
men har ingen konkret scope-definition. Kräver UX-spec:
- Vilken Tab-ordning (bulk-dialoger, list-rader, detail-view)?
- Enter-activation på list-rader?
- Arrow-keys i tabell (kräver roving-tabindex-refaktor)?
- Focus-trap-edge-cases i Radix-dialoger?

**Estimat:** 0.5 SP UX-spec + 1–3 SP implementation beroende på scope.
**Nästa steg:** UX-spec som avgränsar scope innan implementation.
Ägare: William.

## Preventiv audit-resultat

`grep -rn "return err as IpcResult" src/main/services --include="*.ts"`:

```
src/main/services/bank/bank-statement-service.ts:235
```

1 träff — den dokumenterade WONTFIX i T1.a. Ingen annan latent variant
kvar efter Sprint D F7f + Sprint E T1.a.

## Bodyguard-verifiering

- PRAGMA user_version: **41** (oförändrat) ✓
- Inga nya M-principer ✓
- Inga nya IPC-kanaler ✓
- Inga nya ErrorCodes ✓
- Ingen publik yta-utvidgning i bank-/invoice-/expense-/correction-/
  depreciation-service ✓
- Ingen ny data-testid utanför
  [tests/e2e/README.md:38-55](tests/e2e/README.md:38) whitelist — E2E
  använder text-selector (`getByRole('button', { name: /^utkast/i })`) ✓
- Ingen ny ADR ✓
- `useInvoiceList`/`useExpenses`-kontrakt oförändrat ✓

## Avvikelser från promptens acceptance-definition — LÖST i follow-up-commit

**Ursprunglig avvikelse:** Repoet hade 4518 pre-existerande prettier-/
unused-vars-fel, vilket gjorde `npm run lint` oanvändbar som acceptance-gate.

**Lösning i follow-up-commit (efter SE-huvudcommit 9715ea0):**

1. **Prettier baseline cleanup (f757534):** `npm run lint:fix` auto-fixade
   4229 prettier-fel över 273 filer. Inga kod-semantiska ändringar —
   enbart formatering (indent, quotes, trailing commas, line-length).
   Typecheck OK, vitest 2494/2494 oförändrat, alla `check:*` OK.

2. **Diff-scoped lint-gate:** Nytt script `scripts/check-lint-new.mjs`
   + `npm run check:lint-new`-kommando. Lintar bara .ts/.tsx-filer
   ändrade relativt base-branch (default `main`). På main-branch är det
   no-op med förklarande meddelande — designed för feature-branch-gate.

3. **Kvarvarande baseline-skuld (187 fel):**
   - 96 `@typescript-eslint/no-explicit-any` (kräver typ-bedömning)
   - 76 `@typescript-eslint/no-unused-vars` (mekanisk, cross-cutting)
   - 8 `no-restricted-syntax`
   - 5 `@typescript-eslint/no-require-imports`
   - 2 `jsx-a11y/no-static-element-interactions`

   Dessa är legitima tech-debt som kräver per-fil-bedömning. Lämnas
   som Sprint F-kandidat eller rullande cleanup via framtida `check:lint-new`-
   gate (nya filer kan inte lägga till fler).

**Framtida PR-acceptance:** kör `check:lint-new` från feature-branch
innan merge — garanterar att nya/ändrade filer är lint-rena utan att
baseline måste vara 100% grön.

**Verifiering:**
- Feature-branch med `any`-fel → `check:lint-new` exit 1 ✓
- Feature-branch med ren kod → `check:lint-new` exit 0 ✓
- Main-branch → no-op med förklaring ✓

## Minnes-uppdatering

Sprint-state efter SE: **"Sprint E KLAR — cleanup + T3-dokumentation"**

Utfall enligt tabell i [sprint-e-prompt.md:559](docs/sprint-e-prompt.md:559):
T1.a dokumenterat + T2.a stängd + T2.b/T2.c skippade per pre-flight +
T3 dokumenterat.

## Deliverables

- **Kod (4 filer):**
  - [bank-statement-service.ts](src/main/services/bank/bank-statement-service.ts) — WONTFIX-kommentar (T1.a)
  - [use-filter-param.ts](src/renderer/lib/use-filter-param.ts) — NY hook (T2.a)
  - [InvoiceList.tsx](src/renderer/components/invoices/InvoiceList.tsx) — adoption av hook
  - [ExpenseList.tsx](src/renderer/components/expenses/ExpenseList.tsx) — adoption av hook
- **Tester (4 filer, 19 tester):**
  - [use-filter-param.test.ts](tests/renderer/lib/use-filter-param.test.ts) — 11 hook-tester
  - [InvoiceList.url-state.test.tsx](tests/renderer/components/invoices/InvoiceList.url-state.test.tsx) — 4 integration
  - [ExpenseList.url-state.test.tsx](tests/renderer/components/expenses/ExpenseList.url-state.test.tsx) — 4 integration
  - [filter-url-state.spec.ts](tests/e2e/filter-url-state.spec.ts) — 1 E2E
- **Docs:**
  - `docs/sprint-e-summary.md` (denna fil)
- **Memory + STATUS.md:** uppdaterade enligt prompt

## Exit

- Grön vitest-suite (2494 tester, 249 filer)
- E2E 67p/0f
- Alla `check:m133`/`check:m133-ast`/`check:m153` OK
- Typecheck OK
- Lint OK för nya filer (pre-existing debt utanför scope)
- PRAGMA 41 bevarad
