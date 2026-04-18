# Sprint J — F49-c2 Roving-tabindex + widget-focus + aria-live ✅ KLAR

**Session:** 2026-04-18 (Sprint J, direkt efter Sprint I)
**Scope:** F49-c keyboard-navigation, fas 2 (c2) enligt
[docs/f49c-keyboard-nav-spec.md § 8](f49c-keyboard-nav-spec.md).
**Estimat:** ~2 SP. **Faktiskt:** ~2 SP.

## Leverans

### 1. Roving-tabindex (InvoiceList + ExpenseList)

Ny `useRovingTabindex`-hook i `src/renderer/lib/use-roving-tabindex.ts`.
Spread `getRowProps(idx)` på varje `<tr>`-element.

**Tangenter:**
- `↑` / `↓` — flytta till föregående/nästa rad
- `Home` — första raden
- `End` — sista raden
- `Enter` — triggar `onSelect(idx)` (i listorna: `handleRowClick`)

**Beteende:**
- Bara activeRow har `tabIndex=0`, andra `-1` → Tab lämnar listan direkt
- `onFocus` bubblar från mus-klick → activeIdx synkar
- `rowCount` krymper → activeIdx clampas till sista giltiga index
- `preventDefault` på alla hanterade tangenter — browser default-scroll blockeras

**Implementationsval:**
- `<tr>` får `tabIndex` + `onKeyDown` + behåller `onClick` (mouse-kompatibelt).
  Ingen `<Link>`-wrapping (undvek stor arkitektur-refaktor).
- `focus:ring-2 focus:ring-inset focus:ring-ring` för synlig fokus-ring.

### 2. Dashboard MetricCard fokuserbara + Enter-aktiverade

`MetricCard`-komponenten utökad med optional `onClick`-prop:
- Utan `onClick`: presentational `<div>` (bakåtkompatibelt).
- Med `onClick`: semantisk `<button type="button">` — fokuserbar,
  Enter + Space aktiverar (default browser-behavior för button).

`PageOverview` uppdaterad med navigeringsmål per widget:

| Widget | Route |
|---|---|
| Intäkter | `/income` |
| Kostnader | `/expenses` |
| Rörelseresultat | `/reports` |
| Moms netto | `/vat` |
| Obet. kundfordringar | `/aging` |
| Obet. lev.skulder | `/aging` |

Uses `useNavigate()` från befintlig HashRouter.

### 3. Form-totals `aria-live="polite"`

`InvoiceTotals` + `ExpenseTotals` fick `aria-live="polite"` +
`aria-label="Totaler"` på container-elementet. Screen readers annonserar
ändringar när användaren pausar (inte omedelbart, undviker störande
avbrott vid varje tangenttryck).

### 4. Tester

**Vitest (+17):**
- `tests/renderer/lib/use-roving-tabindex.test.tsx` (12 tester) —
  tabIndex-rotation, ↑/↓/Home/End, Enter+onSelect, onFocus-sync,
  rowCount-clamp.
- `tests/renderer/components/overview/MetricCard.test.tsx` (+5 tester) —
  div utan onClick, button med onClick, click + Enter aktiverar,
  focus-ring-styling.

**E2E (+2):**
- `tests/e2e/keyboard-nav-c2.spec.ts`:
  1. ↓ + Enter på fakturarad → hash matchar `/income/(view|edit)/\d+`
  2. MetricCard Enter navigerar till rätt route (Intäkter → /income,
     Kostnader → /expenses)

## Verifiering

- **Vitest:** 2546 → **2563 (+17)** — alla 17 nya
- **Playwright:** 44 → **45 specfiler (+1)**, 70 → **72 test() (+2)**,
  full-run **72p/0f**
- **PRAGMA user_version:** 43 (oförändrat)
- `npm run check:m133` ✅
- `npm run check:m133-ast` ✅ (self-test + scan gröna)
- `npx tsc --noEmit` ✅
- Axe passerar i alla nya + ändrade renderer-tester

## Inga nya

- **Nya IPC-kanaler:** 0
- **Nya M-principer:** 0 (M156 är fortfarande draft — promotion efter c3)
- **Nya ErrorCodes:** 0
- **Nya migrationer:** 0

## Designval

### Varför `<tr tabIndex>` istället för `<Link>`-wrapping

Specen § 3 nämnde två alternativ för rad-Enter-aktivering: `<tr role="row" tabIndex>`
eller wrappa rad-innehåll i `<Link>` med `display: table-row`-CSS.
Valde `<tr tabIndex>` — mindre invasivt, behåller befintliga `<tr onClick>`
för mus-users, inga CSS-gymnastics. Roving-tabindex-mönstret passar naturligt.

### Varför `<button>` för MetricCard (inte `<div role="button">`)

Semantisk — `<button>` kommer med default Enter/Space-aktivering, korrekt
ARIA-roll, och no-JS-fallback. Kostnaden: overrida default-CSS med
`text-left` + `bg-transparent` + `w-full` — trivialt i Tailwind.

### Varför `aria-live="polite"` (inte `assertive`)

Totals uppdateras vid varje qty/pris-ändring (debounced i React-render).
`assertive` skulle avbryta screen reader mid-sentence varje siffra.
`polite` väntar tills användaren pausar — mindre störande.
`aria-atomic` default false — bara ändrade textnoder läses om.

### Varför onFocus-bubbling synkar activeIdx

Om användaren klickar på rad 5 (mus), ska Tab-ut + Tab-in återgå till
rad 5, inte rad 0. onFocus-eventet bubblar upp från children — så
klick på rad-actions (Bokför/Betala/PDF) triggar också activeIdx-sync.

## Scope-utelämningar (inte Sprint J)

- **Action-knappar i rad behåller sin standard Tab-behavior.**
  Specen § 4 Alt B säger "Tab lämnar listan direkt" — detta gäller
  `<tr>`-elementen, inte deras children. Rad-knappar (Bokför, Betala,
  PDF, Kreditera) är fortfarande Tab-barra när fokus är inuti rad.
  Deras tabIndex-management är c3-skop om det blir problem.
- **Space på rad togglar checkbox.** Specen § 3 nämner detta undantag.
  Idag: Space default scroll-down (blockeras inte av vår onKeyDown).
  Checkbox-toggling kräver explicit handler. c3-polish.

## Filer (delta mot Sprint I)

**Nya (4):**
- `src/renderer/lib/use-roving-tabindex.ts`
- `tests/renderer/lib/use-roving-tabindex.test.tsx`
- `tests/e2e/keyboard-nav-c2.spec.ts`
- `docs/sprint-j-summary.md`

**Modifierade (7):**
- `src/renderer/components/invoices/InvoiceList.tsx` — hook + rowProps + focus-ring
- `src/renderer/components/expenses/ExpenseList.tsx` — samma
- `src/renderer/components/overview/MetricCard.tsx` — optional onClick → button
- `src/renderer/pages/PageOverview.tsx` — onClick per MetricCard till routes
- `src/renderer/components/invoices/InvoiceTotals.tsx` — aria-live=polite
- `src/renderer/components/expenses/ExpenseTotals.tsx` — aria-live=polite
- `tests/renderer/components/overview/MetricCard.test.tsx` — +5 tester

## Kvar i F49-c

**Sprint K (c3) — ~0.5 SP:**
- Radix-dialog focus-trap edge-cases (nested, unmount-cleanup) — F-D1
- Axe-run på samtliga Radix-dialoger
- Per-dialog Escape + fokus-återgång-tester

Efter c3: **M156 promoteras** till accepterad M-princip i CLAUDE.md.
