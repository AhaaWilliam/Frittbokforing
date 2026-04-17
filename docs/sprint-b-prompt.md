# Sprint B — Kvalitet + enforcement (~4 SP)

**Datum:** 2026-04-17 (planerat)
**Tema:** Noll nya features. Stänger tre kvalitetsskulder: a11y-bredd (F68),
M133-städning (F69), AST-utökning av M133 (F49-b) och en liten E2E-vakans (F62-c).

**Testbaslinje:** 2437 vitest, 58 Playwright-specs. PRAGMA 41.

---

## Bakgrund och motivation

### Varför nu?
Sprint A levererade bank-MVP. Tre oberoende kvalitetsskulder har ackumulerat:

1. **M133-check failar** — `npm run check:m133` rapporterar 101 `axeCheck: false`
   i 24 testfiler. Dessa lades till under S55–S58 för nya komponenter (bank-UI,
   SuggestedMatchesPanel, Pagination, EntityListPage m.fl.) utan att F49-
   behandlingen gjordes. M133 ska vara grön efter varje sprint — den är röd nu.

2. **F49-b backlog** — M133 grep-check skyddar mot `axeCheck: false`-återinförsel
   men fångar inte error-`<p>` utan `role="alert"` (multi-line JSX). F49-b
   lägger till AST-baserad kontroll via ts-morph.

3. **F62-c E2E-vakans** — `tests/e2e/depreciation-execute.spec.ts` är aldrig
   skriven (F62.6 i s53-summary). F62-c-extension (sale-price, S55 B1) ger
   extra scenario utan extra setup-kostnad.

### Violations-landskap (M133 audit 2026-04-17)
`npm run check:m133` ger 101 violations i 24 filer:

| Violations | Filer |
|---|---|
| 10 | `PeriodList.test.tsx` |
| 9 | `PageBudget.test.tsx`, `PageAccruals.test.tsx`, `GlobalSearch.test.tsx` |
| 8 | `EntityListPage.test.tsx` |
| 7 | `YearPicker.test.tsx` |
| 6 | `PageAgingReport.test.tsx`, `Sidebar.test.tsx` |
| 5 | `Pagination.test.tsx` |
| 4 | `ImportPreviewPhase.test.tsx`, `SuggestedMatchesPanel.test.tsx` |
| 3 | `MonthIndicator.test.tsx`, `InvoiceList.test.tsx`, `ContactList.test.tsx` |
| 2 | `ConfirmFinalizeDialog.test.tsx`, `DraftList.test.tsx`, `ExpenseDraftList.test.tsx`, `CustomerDetail.test.tsx` |
| 1 | `ConfirmDialog.test.tsx`, `ProductForm.test.tsx`, `ProductDetail.test.tsx`, `InvoicePdf.test.tsx`, `PayExpenseDialog.test.tsx`, `CustomerForm.test.tsx` |

**Viktigt:** Violation = `axeCheck: false` saknar `// M133 exempt`-kommentar.
Det betyder **inte** att komponenten har axe-violations — den kanske redan är
a11y-korrekt. Audit-processen (se nedan) avgör vilken fix som behövs per fil.

**Redan-OK-signaler (snabb pre-analys):**
- `GlobalSearch.tsx` har full combobox/listbox ARIA (role="combobox", aria-expanded,
  aria-haspopup, role="listbox", role="option", aria-activedescendant).
- `ConfirmDialog.tsx` har role="alertdialog", aria-modal, aria-labelledby,
  aria-describedby — bör passera axe direkt.
- `CustomerForm`/`ProductForm` använder `FormField` (F49-behandlad) — bör
  passera axe direkt.
- `InvoiceList.test.tsx` rows 129/148/185 — InvoiceList HAR dedikerat axe-
  test (rows 40/78 med `// M133 exempt`), de nya raderna saknar bara
  kommentaren.

---

## Deliverables

### A — F68/F69: A11y-bredd + M133-städning (2.5 SP)

**Mål:** `npm run check:m133` → `✅ M133 OK`. Axe-coverage utökad till alla
24 komponenter. Inga nya axe-violations (dvs. komponenterna fixas *om* de
har violations).

**Process per fil:**

```
1. Audit — ta bort axeCheck:false temporärt i en testfil, kör npm test.
   a) Tester GRÖNa → inga violations. Åtgärd: ta bort flaggan permanent.
   b) Tester RÖDa med axe-violation → komponent behöver ARIA-fix.
      Åtgärd: fixa komponenten, ta sedan bort flaggan.
   c) Fil har REDAN dedikerat axe-test (M133 exempt-fall) →
      Åtgärd: lägg till // M133 exempt-kommentar, ta bort flaggan INTE.
```

**Commit-struktur (förslag — justera om audit visar annat):**

| Commit | Scope | Förväntad åtgärd |
|---|---|---|
| A1 | `ConfirmDialog`, `CustomerForm`, `ProductForm`, `CustomerDetail`, `ProductDetail`, `ContactList`, `MonthIndicator` | Troligen bara `axeCheck:false`-borttagning (ingen komponent-fix) |
| A2 | `InvoiceList` (rows 129/148/185), `InvoicePdf` | Lägg till `// M133 exempt — dedicated axe test below`-kommentar |
| A3 | `Pagination`, `ConfirmFinalizeDialog`, `PayExpenseDialog` | Ev. minor ARIA-fix + borttagning |
| A4 | `DraftList`, `ExpenseDraftList`, `PeriodList` | Audit-driven |
| A5 | `GlobalSearch`, `YearPicker`, `Sidebar` | Audit-driven; GlobalSearch troligen OK |
| A6 | `EntityListPage`, `ImportPreviewPhase`, `SuggestedMatchesPanel` | Audit-driven; ev. tabell/list-ARIA |
| A7 | `PageAgingReport`, `PageAccruals`, `PageBudget` | Full-page axe; ev. heading-hierarki, landmark-roller |
| A8 | Verify: `npm run check:m133` → grön, `npm test` → grön | Ingen kod-ändring |

**Om axe-violations hittas:**
- Vanliga fixar: `<nav aria-label="...">` för nav-element, `aria-label` på
  icon-only-knappar, `role="alert"` på inline error-meddelanden (M133),
  `aria-live="polite"` på status-regioner.
- `role="alertdialog"` krävs för modala dialoger som har fel/bekräftelse-
  karaktär (ConfirmFinalizeDialog om den saknar detta).
- Tabeller med `<th>` kräver `scope="col"`/`scope="row"`.
- Ingen ny `useId()`-hook — existerande `${formName}-${field}-error`-mönster
  (M133-arkitektur från F49) används konsekvent.

**M133-checkerns filter:** Filer med `// M133 exempt`-kommentar på SAMMA
RAD som `axeCheck: false` filtreras bort. Format:
```tsx
await renderWithProviders(<Foo />, { axeCheck: false }) // M133 exempt — dedicated axe test in X
```

**Ny M-princip:** Ingen ny M-princip förväntas — F68/F69 är enforcement
av befintliga M133/F49-principer. Om en komponent-kategori uppvisar ett
mönster som inte täcks av nuvarande M133-text → lägg till klarifikation.

**Test-delta estimat (A1–A8):**
- Vitest: +0 till +8 (nya dedikerade axe-tester för komponenter utan coverage;
  beror på audit-utfall). Varje axe-tester räknas som 1 test.
- `axeCheck: false` tas bort från ~101 platser (eller ersätts med `// M133 exempt`).
- Netto test-count: sannolikt +0 till +5 (befintliga tester körs nu med axe ON).

---

### B — F49-b: AST-baserad M133 (1 SP)

**Mål:** `npm run check:m133-ast` fångar error-`<p>` utan `role="alert"` via
TypeScript AST — inte grep-regex som inte klarar multi-line JSX.

**Motiv:** Grep-regex i nuvarande `check-m133.mjs` kräver att `axeCheck: false`
och `role="alert"` är på *samma rad*. En `<p>` som renderar `{errors.name}` utan
`role="alert"` på flera rader detekteras inte. AST-approach traverserar JSX-trädet
korrekt oavsett formatting.

**Teknisk spec:**

Verktyg: `ts-morph` (redan i repo? — verifiera; annars `npm install -D ts-morph`).

```typescript
// scripts/check-m133-ast.mts
// Traverserar src/renderer/**/*.tsx
// Hittar JSXElement med tagName === "p"
// Kontrollerar om element-innehållet refererar fel-variabler:
//   - JSXExpressionContainer med expression som innehåller "errors.", "error", "submitError"
//   (enkel heuristik: PropertyAccessExpression eller Identifier vars text matchar pattern)
// Om träff: verifiera att elementet har JSXAttribute med name="role" och value="alert"
// Om saknas → rapportera fil + radnummer
```

**Undantag:**
- Filer med `// m133-ok` på raden ignoreras (befintligt konvention).
- `src/renderer/components/ui/FormField.tsx` (och FormSelect, FormTextarea) —
  dessa har korrekt `role="alert"` sedan F49. Verifiera att de passerar, annars
  visa att de är det positiva exemplet.

**Integration:**
```json
// package.json
"check:m133-ast": "node --experimental-strip-types scripts/check-m133-ast.mts"
```

Eller om ts-morph kräver kompilering:
```json
"check:m133-ast": "tsx scripts/check-m133-ast.mts"
```

(`tsx` är troligen redan installerat — verifiera med `npx tsx --version`.)

**Självtest:** Lägg till en minimal renderer-testfil med avsiktlig violation,
kör check:m133-ast och verifiera att den flaggas. Ta bort filen. Detta är
integration-smoke, inte vitest-test.

**Utfall:** `check:m133-ast` läggs till i `README`/`CHECKLIST.md`-sektionen
för manuella gates (paritet med `check:m133` och `check:m153`).

**Test-delta:** +0 vitest (det är ett script, inte ett test). +1 om ett
minimal smoke-test skrivs som vitest (valfritt).

---

### C — F62-c: Asset disposal E2E (0.5 SP)

**Mål:** `tests/e2e/depreciation-execute.spec.ts` skriven. Täcker det kritiska
flödet: skapa anläggningstillgång → kör avskrivning → gör avyttring.

**Bakgrund:**
- F62.2 (service) + F62.3 (IPC) + F62.4 (UI) levererades i S53.
- F62-c basic (disposal-verifikat utan försäljningspris) levererades i S54.
- F62-c-extension (disposal med försäljningspris, DisposeDialog) levererades
  i S55 B1.
- **Ingen E2E-spec finns** (F62.6 i s53-summary.md markerad "kvarstår i backlog").

**Seed-sekvens (via `window.api` och `window.__testApi`, M148):**
```
1. Skapa företag + FY (standard wizard-flow eller __testApi)
2. Skapa anläggningstillgång:
   window.api.createFixedAsset({ name: 'Dator', cost_ore: 1_500_000,
     start_date: '2024-01-01', useful_life_years: 3,
     depreciation_account: '7831', asset_account: '1220' })
3. Kör avskrivning för månad 1:
   window.api.executeDepreciationSchedule({ scheduleId, period: '2024-01' })
```

**Tester (3 scenarion i spec):**

```
T1 — Happy: skapa tillgång + kör avskrivning
  Given: anläggningstillgång skapad med 3 år useful_life
  When: kör avskrivning för period 2024-01
  Then: tillgången visas i PageFixedAssets
        detalj-panel visar "Avskrivet: 41 667 kr" (1_500_000 / 36 månader)
        E-serie-verifikat finns i journal_entries

T2 — Disposal utan försäljningspris
  Given: tillgång med 1 avskrivning körd (T1-state)
  When: klicka "Avyttra" → ConfirmDialog → bekräfta
  Then: tillgången markeras disposed
        disposal-verifikat skapat (D 1220 / K 7970 på nettovärde)

T3 — Disposal med försäljningspris (F62-c-extension)
  Given: en ny tillgång (separerad från T2 för att undvika state-beroende)
  When: klicka "Avyttra" → DisposeDialog → ange försäljningspris 800 000 kr
        → bekräfta
  Then: disposal-verifikat inkluderar vinst-/förlust-bokföring mot 3970/7970
```

**Data-testid som krävs (M117):**
Verifiera att dessa finns i UI (lägg till om saknas):
- `data-testid="page-fixed-assets"` (på PageFixedAssets root)
- `data-testid="fixed-asset-row-{id}"` (på varje tillgångsrad)
- `data-testid="dispose-button"` (på Avyttra-knappen)
- `data-testid="dispose-dialog"` eller `data-testid="confirm-dialog"` (på dialogroten)

Om `data-testid` saknas på dispose-relaterade element — lägg till dem (whitelist
i `tests/e2e/README.md`).

**Test-delta:** +1 Playwright-spec (3 test-scenarion registrerade).

---

## Ordning och beroenden

```
A (F68/F69) och B (F49-b) och C (F62-c) är oberoende av varandra.

Rekommenderad körordning:
1. C (F62-c) — isolerad, enklast att avgränsa, noll risk för regressioner
2. A (F68/F69) — mest arbete, audit-drivet, men väldefinierade exit-criteria
3. B (F49-b) — AST-infra, läggs sist så att A:s rensning ger ren baseline att köra mot
```

---

## Exit-criteria (DoD)

- [ ] `npm run check:m133` → `✅ M133 OK`
- [ ] `npm run check:m133-ast` → `✅ M133-AST OK` (eller inga violations om
  nuvarande komponenter redan är korrekta)
- [ ] `npm test` → alla vitest gröna (inklusive axe-check aktiverat på ~24 komponenter)
- [ ] `npx playwright test` → alla 58+ specs gröna (inklusive ny F62-c-spec)
- [ ] `npm run check:m153` → `✅ M153 OK` (oförändrat)
- [ ] TSC: 0 errors

---

## Vad som INTE ingår

- **F62-d asset-redigering** — kräver schedule-regeneration-logik, separat sprint
- **Keyboard-navigation (F49c)** — fokus-ordning, skip-links, arkitektur-arbete
- **Lists/tabeller a11y (F49b-lists)** — `role="row"`, `aria-sort`, table-semantics
- **Wizard-pattern (F49d)** — OnboardingWizard, steg-announcering
- **Batch-unmatch** — backlog
- **URL-state för pagination** — F-item
- **Nya features** — ingenting nytt

---

## Kända risker

**R1 — Axe-violations i Page-komponenter.**
PageBudget/PageAccruals/PageAgingReport är komplexa sidor med tabeller, knappar
och formulär. Om de har heading-hierarki-problem eller saknar landmarks kan
fixarna ta längre tid än estimerat. Mitigation: gör Page-commits sist (A7)
så att de enkla komponenterna (A1–A6) dräneras ur M133 oavsett.

**R2 — ts-morph inte installerat.**
Om `ts-morph` inte finns i repo — kör `npm install -D ts-morph`, verifiera
att package.json uppdateras. Alternativt: använd TypeScript compiler API
direkt (mer verbose) eller `tsx` med ts-api-utils. Välj den som minimerar
ny dependency-surface.

**R3 — AST-check för många false positives.**
Error-variabel-heuristiken (matcha `errors.`, `error`, `submitError`) kan
matcha legitima icke-alert-`<p>` (t.ex. en `<p>{error.stack}</p>` i en
dev-only debug-vy). Lägg till `// m133-ok`-escape hatch och dokumentera
i check-scriptet.

**R4 — F62-c disposal-UI har inga data-testid.**
Om PageFixedAssets saknar `data-testid` på kritiska element → lägg till
dem i whitelist (M117) som del av F62-c-commit. Kontrollera
`tests/e2e/README.md`-whitelist innan nya testid:n läggs till.

---

## Infrastruktur-noteringar

- **Axe-serialisering (M58-fix från S58):** `render-with-providers.tsx` har
  module-level `axeChain`-promise sedan S58. När `axeCheck: false` tas bort
  och fler tester kör axe parallellt — detta hanteras redan. Inga ändringar
  i infrastrukturen behövs.
- **M133 exempt-konvention:** Exakt format `// M133 exempt` (space, inget
  bindestreck) — check-scriptet filtrerar på `line.includes('M133 exempt')`.
  Längre kommentar OK: `// M133 exempt — dedicated axe test in describe-block below`.
