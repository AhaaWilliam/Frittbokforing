# Sprint I — F49-c1 Skip-links + landmarks + Tab-audit ✅ KLAR

**Session:** 2026-04-18 (Sprint I)
**Scope:** F49-c keyboard-navigation, fas 1 (c1) enligt
[docs/f49c-keyboard-nav-spec.md § 8](f49c-keyboard-nav-spec.md).
**Estimat:** ~1 SP. **Faktiskt:** ~1 SP.

## Leverans

### Skip-links (3 länkar, varav 1 conditional)

1. **Hoppa till huvudinnehåll** — alltid närvarande, Tab från body +
   Enter fokuserar `<main id="main-content">`.
2. **Hoppa till massåtgärder** — conditional, renderas endast när
   bulk-action-bar är aktiv i InvoiceList eller ExpenseList. Target:
   `<div id="bulk-actions">`.
3. **Hoppa till navigering** — alltid närvarande, target:
   `<nav id="primary-nav">` i Sidebar.

**DOM-ordning per spec:** main → bulk (om aktiv) → nav.

**Styling:** `sr-only focus:not-sr-only` — visuellt dolda tills
fokuserade. Vid fokus: fixed position, top-2 left-2, z-50.

### Landmarks (3 nya id:n)

- `<main id="main-content">` i `AppShell.tsx`
- `<nav id="primary-nav">` i `Sidebar.tsx`
- `<div id="bulk-actions" role="region" aria-label="Massåtgärder">`
  i InvoiceList + ExpenseList

### Context-baserad conditional visibility

`SkipLinksContext` (ny) exponerar `bulkActionsActive` + setter.
InvoiceList och ExpenseList registrerar `true` via `useEffect` när
`selectedIds.size > 0` och `false` vid cleanup/unmount.
Render-with-providers test-helper wrappar med `SkipLinksProvider` så
befintliga renderer-tester fungerar.

### Tab-audit (docs/f49c1-audit.md)

Dokumenterar befintlig Tab-ordning i 4 ytor mot spec § 2:

| Yta | Finding | Status |
|---|---|---|
| InvoiceList/ExpenseList | F-L3 bulk-landmark saknades | ✅ Fixat |
| InvoiceList/ExpenseList | F-L1 rad-keyboard-nav | Eskalerad c2 |
| Forms | F-F2 totals aria-live saknas | Eskalerad c2 |
| Dialogs | F-D1 nested/unmount edge-cases | Eskalerad c3 |
| Dashboard | F-Dash2 main-landmark saknades | ✅ Fixat |
| Dashboard | F-Dash1 widget-fokuserbarhet | Eskalerad c2 |

**Ingen `tabIndex`-manipulation i c1.** Awkward-fixes är trivial
landmark-tillägg; beteendeändringar (roving-tabindex, widget-Enter-nav,
aria-live totals) skjuts till Sprint J (c2).

## Verifiering

### Testbaslinje

- **Vitest:** 2534 → **2546 (+12)** — alla 12 nya i
  `tests/renderer/components/layout/SkipLinks.test.tsx`
- **Playwright:** 43 → **44 specfiler (+1)**, 68 → **70 test() (+2)**,
  full-run **70p/0f** (bonus-fix av 2 pre-existing SF-regressioner, se
  nedan)
- **PRAGMA user_version:** 43 (oförändrat)

### Gates

- `npm run check:m133` ✅ OK
- `npm run check:m133-ast` ✅ OK (self-test + scan båda gröna)
- `npx tsc --noEmit` ✅ OK
- Axe-tester passerar i både SkipLinks.test.tsx och
  InvoiceList.test.tsx (dedikerad axe-check)

### Inga nya

- **Nya IPC-kanaler:** 0
- **Nya M-principer:** 0 (M156 är draft i F49-c-spec, promoteras först
  efter c1/c2/c3 alla levererade + regression-tester finns)
- **Nya ErrorCodes:** 0
- **Nya migrationer:** 0

## E2E-tester (keyboard-nav.spec.ts)

**Två tester, båda gröna (1.8s + 1.3s):**

1. `skip-links finns + main/nav fokuseras vid klick` — verifierar att
   main + nav skip-links renderas, att Enter på fokuserad länk
   fokuserar rätt target, och att hash inte ändras (HashRouter-
   kollision undviks via `preventDefault`).
2. `bulk-skip-link visas när fakturor selekteras` — seedar faktura,
   navigerar till `/income`, klickar checkbox → bulk-skip renderas +
   `#bulk-actions` blir visible; Enter på bulk-skip fokuserar
   landmark; avmarkera → skip försvinner.

**M147-not:** Inga nya dialog-bypass-callsites.

## Bonus-fix: 2 pre-existing E2E-regressioner efter Sprint F

Upptäckta under Sprint I full-E2E-regressionskontroll. Båda var
test-buggar, inte prod-buggar. Bundlade med Sprint I-commit eftersom
fix <10 rader totalt och krävde inga nya produkt-ändringar.

**1. `bank-fee-auto-classify` S58 B3:**
Testets CAMT053-XML hade `BkTxCd: PMNT/NTAV/CHRG`. Sprint F P4 migrerade
fee-classifier från hårdkodad (som matchade bred SubFmlyCd=CHRG) till
DB-driven med seed `PMNT/CCRD/CHRG`. Classifier kräver nu exakt match på
(domain, family, subfamily). Testet uppdaterades inte. Fix: `NTAV → CCRD`
i XML.

**2. `bank-unmatch-batch` SF P2:**
Testets CAMT053-XML hade `opening=0.00, closing=300.00` men bara en
transaktion på `125.00`. `importBankStatement` validerar `opening + sum
=== closing` för camt.053 (korrupt-file-check). 0 + 125 ≠ 300 →
`VALIDATION_ERROR` "Bankfilen är korrupt eller trunkerad". Fix: closing
`300.00 → 125.00` så balans matchar.

**Varför missades dessa under Sprint F?** Sprint F-leveransen fokuserade
på P1–P6-faserna och förlitade sig på per-fas-regression-tester snarare
än full E2E-run i slutet. Båda test-spec:arna var orörda under Sprint F,
så verkade inte behöva re-körning. DB-driven classifier (P4) och
balans-check-implementation (pre-existing) landade separat utan att
trigga spec-körning.

**Framtida mitigering:** Kör full E2E som sista steg i varje sprints
verifieringsmatris, inte bara berörda subsets.

## Designval

### Varför fokus + Enter i E2E istället för click()

Skip-links är `sr-only` (visuellt dolda) tills fokuserade. Playwrights
`click()` actionability-check anser sr-only-element som invisible och
timeoutar. Lösning: `focus()` + `page.keyboard.press('Enter')` — speglar
dessutom det verkliga keyboard-användar-flödet (Tab to skip-link, Enter
to activate).

### Varför context-baserad conditional bulk-skip, inte MutationObserver

Context ger explicit state + deterministisk testbarhet. MutationObserver
hade tvingat skip-link-komponenten att polla DOM, vilket är mindre
React-idiomatiskt och svårare att mocka i unit-tester. Context-kostnad
är minimal: ett boolean + en setter.

### Varför ingen behavioral-ändring i c1

Spec § 8 säger uttryckligen: "c1 + c3 är lågrisk — kan ro-as oberoende
av c2". c1 är skip-links + landmarks + audit. Behavioral-adds
(roving-tabindex, widget-Enter-nav, aria-live totals) är c2 —
inkluderar dessa i c1 skulle öka risk + estimat utan att blocker för
leveransen.

## Filer (delta mot main)

**Nya (5):**
- `src/renderer/contexts/SkipLinksContext.tsx`
- `src/renderer/components/layout/SkipLinks.tsx`
- `docs/f49c1-audit.md`
- `tests/renderer/components/layout/SkipLinks.test.tsx`
- `tests/e2e/keyboard-nav.spec.ts`

**Modifierade (5):**
- `src/renderer/pages/AppShell.tsx` — Provider + SkipLinks + main-id
- `src/renderer/components/layout/Sidebar.tsx` — nav-id
- `src/renderer/components/invoices/InvoiceList.tsx` — useSkipLinks + bulk-id + bulk-registrering
- `src/renderer/components/expenses/ExpenseList.tsx` — samma
- `tests/helpers/render-with-providers.tsx` — wrap med SkipLinksProvider

## Kvarvarande i F49-c

**Sprint J (c2) — ~2 SP:**
- Roving-tabindex för InvoiceList/ExpenseList rad-nivå-navigering (F-L1, F-L2)
- Enter-aktivering på list-rader → detalj-vy
- Dashboard MetricCard-fokuserbarhet + Enter-nav (F-Dash1)
- Totals `aria-live="polite"` i forms (F-F2)

**Sprint K (c3) — ~0.5 SP:**
- Dialog focus-trap edge-cases (nested, unmount-cleanup) (F-D1)
- Axe-run på samtliga Radix-dialoger
- Per-dialog Escape + fokus-återgång-tester

Efter alla tre: M156 promoteras till accepterad M-princip.
