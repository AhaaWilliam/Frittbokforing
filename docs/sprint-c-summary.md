# Sprint C — F62-d Asset-redigering + B1 URL-pagination

**Levererat:** 2026-04-17. Två små oberoende features som städar upp
backlog från Sprint 53 (F62-d) och Sprint 57 (B1). Noll nya
affärsinvarianter.

## Testbaslinje

| Mätvärde | Före (S58) | Efter (SC) | Δ |
|---|---|---|---|
| Vitest | 2437 | 2471 | +34 |
| Testfiler | 240 | 243 | +3 |
| Playwright specs | 58 | 60 | +2 |
| Playwright tester (full suite) | 62 | 66 | +4 |
| PRAGMA user_version | 41 | 41 | 0 |
| Nya IPC-kanaler | — | `depreciation:update-asset` | +1 |
| Nya M-principer | — | — | 0 |
| Nya ErrorCodes | — | `HAS_EXECUTED_SCHEDULES` | +1 |

## Levererat

### A. F62-d Asset-redigering

- **A.1 Service (`updateFixedAsset`).** Pristine-guard (status='active' +
  0 executed/skipped schedules) kör inuti `db.transaction()` mot
  `executeDepreciationPeriod`-race. DELETE pending schedules → UPDATE
  `fixed_assets` (bevarar `id` + `created_at`, sätter `updated_at`) →
  regenerera via befintlig `insertSchedule`-helper.
- **A.2 IPC.** `DepreciationUpdateAssetSchema` i `src/shared/ipc-schemas.ts`
  wrappar `DepreciationCreateAssetSchema` i `{id, input}`. Handler via
  `wrapIpcHandler` (M128 mönster 2). Preload + electron.d.ts uppdaterade.
- **A.3 Hook.** `useUpdateFixedAsset` (useIpcMutation, invalidateAll —
  F-item backlog för precis invalidation om mätbar kostnad uppstår).
- **A.4 UI.** `CreateFixedAssetDialog` → `FixedAssetFormDialog` med
  `mode: 'create' | 'edit'` + optional `initialAsset`. Lazy useState per
  fält, `.toFixed(2)` för belopp-initial, editable konto-fält i båda
  lägen (ingen auto-populate i edit → inget UX-deadlock vid inaktivt
  konto). Titel + submit-text omskiftbara. Edit-knapp (Pencil) i
  `PageFixedAssets` synlig endast när `status='active' &&
  schedules_executed === 0`.
- **A.5 Refaktor.** Inline-validering i `createFixedAsset` extraherad till
  `validateFixedAssetInput` (värde + konto-existens + aktiv-check) och
  `validateAccountChange` (kortare variant för edit — bara nyligen byta
  konton valideras som aktiva). Skip-logik för inaktiva oförändrade
  konton: tillåter bevarande av tidigare giltiga val.
- **A.6 Tester.** 14 system-tester (pristine-guard, edit-idempotens,
  id-preservation, created_at-immutability, method-flip, inaktivt konto
  oförändrat vs ändrat, skipped-schedule-blockering). 9 renderer-tester
  (axe create+edit, pre-populate `.toFixed(2)`, titel+submit-växling,
  konto-fält editable, auto-populate suppressed i edit, payload-korrekthet).
  2 E2E (T1 redigera happy-path, T2 edit-knapp försvinner efter
  executed).

### B. B1 URL-pagination

- **B.1 `usePageParam`-hook.** Läser initial page från
  `getHashParams().get(key)`, fallback till default vid NaN/negativ/ogiltig.
  `setPage` skriver via `setHashParams` (replaceState), tar bort param
  vid default (håller URL kort). `hashchange`-lyssnare håller state i
  synk vid extern URL-mutation. Andra query-params bevaras vid update.
- **B.2 Adoption.** `InvoiceList` → `usePageParam('invoices_page', 0)`;
  `ExpenseList` → `usePageParam('expenses_page', 0)`. Namespace-format
  `{list}_page` för multi-list-sida-safety.
- **B.3 FY-effect-fix.** Tidigare `useEffect(() => setPage(0), [fyId])`
  återställde page till 0 vid mount och dödade URL-init. Ersatt med
  ref-baserad prev-jämförelse som bara triggar reset när FY faktiskt
  byter (inte vid initial undefined → resolved).
- **B.4 Tester.** 10 hook-tester (default, URL-init, fractional/NaN/negativ
  fallback, setPage-URL-sync, default-removal, multi-param-preserve,
  hashchange-sync, multi-hook-isolation). 1 InvoiceList-integration
  (initialRoute `/income?invoices_page=2` → Sida 3). 2 E2E (direkt-URL +
  browser back-button).

## Design-beslut som löste sig själva

### UX-deadlock vid inaktivt konto (QA-audit [QA-K2'])

Om alla tre BAS-konton blivit inaktiva mellan create och edit: pristine-
guard tillåter edit, men `validateAccountsActive` skulle tidigare blockera.
Lösning: skip validateAccountsActive för **oförändrade** konton. Ändrade
konton valideras normalt. Inaktiva UI-konto-fält förkastades — skapar
deadlock när användaren inte kan komma ur state.

### Dialog-rename vs duplicering

`CreateFixedAssetDialog` omdöpt till `FixedAssetFormDialog` med mode-prop.
Alternativet (ny `EditFixedAssetDialog` som duplicerar 150 JSX-rader +
inline-validering) gav värre drift-risk vid framtida form-ändringar.

### FY-effect bug fixad som bonus

B1 avslöjade en lurande bug i `InvoiceList`/`ExpenseList`: FY-effect
återställde page=0 vid mount eftersom `useEffect` alltid kör vid första
render oavsett om deps "ändrats". Tidigare osynligt eftersom page default
är 0. Med URL-init (page kan vara ≠ 0 vid mount) blev det synligt.
Refaktorerat till `useRef(prevFyId)` + faktisk-ändring-detektion.

## Avvikelser från plan (retroaktivt dokumenterade)

- **Pre-existing `page-fixed-assets`-testid** (från Sprint B) orsakade
  Playwright strict-mode-violation vid full E2E eftersom AppShell redan
  emitterar `data-testid={`page-${page}`}`. Åtgärdat via separat commit
  `d70ab14` — tog bort den explicita duplikaten. Återställde
  `depreciation-execute` T1/T2/T3 som annars failade i full-suite.
- **Ursprungligen hoppade jag över E2E-specen för pagination** med
  motivering "kräver 50+ faktura-seed". Detta var felaktig bedömning —
  seeding via `window.evaluate`-loop ger 51 drafts på ~1s. Specen
  tillagd som `pagination-url-state.spec.ts` efter användar-feedback.

## Commits

- `2742a4b` feat(SC): F62-d asset-edit + B1 URL-pagination (bundled med
  Sprint B-rester)
- `d70ab14` fix(SC): ta bort redundant page-fixed-assets testid
  (strict-mode-krock)

## Backlog

- **F62-e** — Edit av exekverad tillgång via korrigeringsverifikat
  (C-serie). Scope-beslut i SC: pristine-guard enda path; mutera bokförda
  verifikat går genom korrigering, inte edit. F62-e kräver domän-design
  (korrigera acc.avskr → justera framtida schedule-belopp?).
- **Filter-state i URL** (statusFilter i InvoiceList/ExpenseList). Annat
  koncept än pagination — filter byter subset, pagination scrollar inom.
- **Sort-state i URL**. Inte implementerat ännu; när det införs, lägg i
  URL samtidigt.
- **Precis React Query invalidation** för `useUpdateFixedAsset` (nu
  `invalidateAll: true`). F-item om prestanda-profiling visar mätbar
  kostnad.
- **Pre-existing E2E-failures** (5 st): bank-fee-auto-classify (S58),
  bank-statement-auto-match-partial (S57), bank-unmatch batch-blocked
  (S58), sie4-import-conflict x2 (S57). Orörda av Sprint C.
