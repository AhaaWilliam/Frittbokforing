# F49-c1 — Tab-ordning-audit (Sprint I)

**Datum:** 2026-04-18
**Scope:** 4 ytor (Lists, Forms, Dialogs, Dashboard) per [f49c-keyboard-nav-spec.md § 2](f49c-keyboard-nav-spec.md).

Denna audit dokumenterar befintlig Tab-ordning mot UX-specens kontrakt
och markerar findings som fixas i c1 vs eskaleras till c2/c3.

---

## Yta 1 — InvoiceList / ExpenseList

**Befintlig Tab-ordning** (verifierad via kodläsning):

1. Statusfilter-knappar (button × 4–5, DOM-ordning vänster→höger)
2. Sök-input
3. (Conditional) Bulk-action-bar — Bulk-betala → Exportera PDF → Avmarkera alla
4. Tabell — **tr-elementet ej fokuserbart** (onClick på `<tr>`, ingen tabIndex)
5. Cell-actions: Bokför / Betala / Kreditera / PDF-knapp (varje rad)
6. Pagination: Föregående → sidnummer → Nästa

**Mot spec § 2.1:** ✅ överensstämmer med föreskriven ordning för
filter → search → bulk → actions → pagination.

**Findings:**

- **F-L1** (c2): Tabellrader är klickbara (`<tr onClick>`) men saknar
  keyboard-entry. Användaren kan inte Tab till en rad och trycka Enter
  för att öppna detaljvyn — måste istället tabba genom varje rads
  action-knappar. **Fixas i Sprint J (roving-tabindex + Enter-aktivering).**
- **F-L2** (c2): Inom en rad passerar Tab genom alla action-knappar
  innan nästa rad. OK beteende men gör listnavigering långsam för
  tangentbordsanvändare. Löses indirekt av F-L1 (rad-nivå-nav istället).
- **F-L3** (c1, denna sprint): Bulk-action-bar hade inget landmark eller
  skip-link. **Fixat:** lagt till `id="bulk-actions"` + `role="region"` +
  `aria-label="Massåtgärder"` på båda listor. Skip-link registreras via
  `SkipLinksContext` när bulk-bar är synlig.

**Inga ändringar utöver F-L3 i c1-scope.**

---

## Yta 2 — Forms (InvoiceForm, ExpenseForm, ManualEntryForm)

**Befintlig Tab-ordning** (stickprov):

- Counterparty-search (input)
- Datum-fält (input[type=date])
- Beskrivning (input)
- Rad-fält: Artikel/Konto (select/search) → Beskrivning → Antal → À-pris
  → Moms → Ta bort-ikon (button)
- `+ Lägg till rad`-knapp
- Footer: Avbryt → Spara utkast → Finalisera

Samtliga fokuserbara element är native `<input>` / `<button>` —
default-tab-ordning följer DOM-ordning. Ingen custom `tabIndex`-
manipulation som skulle avvika från spec § 2.2.

**Findings:**

- **F-F1** (c2): Inom en rad går Tab till `Ta bort`-ikonen (sist i
  raden) innan nästa rads första fält. Spec § 2.2 accepterar detta
  beteende ("När fokus når `Ta bort`-ikonen och användaren trycker
  Tab fortsätter fokus till nästa rads första fält"). Ingen åtgärd.
- **F-F2** (c2): Totals-preview är inte fokuserbar men saknar
  `aria-live="polite"`. Spec § 2.2 kräver detta för screen reader-
  uppdatering vid beloppsändring. **Eskaleras till c2 för att
  bundla med roving-tabindex-arbetet.**

**Inga ändringar i c1-scope.**

---

## Yta 3 — Dialogs (ConfirmDialog, BulkPaymentDialog, PaymentDialog)

Radix UI-baserade dialoger har focus-trap + Escape-close inbyggt.
Befintliga axe-tester i `tests/s22c-*.test.tsx` validerar att:

- Tab roterar inom dialogen
- Escape stänger
- Cancel-knappen är default-fokus (destruktiva operationer)

**Findings:**

- **F-D1** (c3): Edge-cases för nested dialogs + unmount-cleanup
  behöver dedikerad audit och tester. Spec § 6.3 flaggar
  "Known issue: om triggern unmountas medan dialogen är öppen...
  tappar fokus återgångspunkt" som acceptabelt men behöver
  dokumentation per dialog. **Eskaleras till Sprint K (c3).**

**Inga ändringar i c1-scope.**

---

## Yta 4 — Dashboard (PageOverview)

**Befintlig struktur:**

- `PageHeader` med h1 (ej fokuserbar, korrekt)
- `MetricCard` × 6 (`<div>`-baserade, ej fokuserbara, presentational)
- `PeriodList` — innehåller knappar per period (close/reopen), fokuserbara
- `ReTransferButton` — fokuserbar

**Befintlig Tab-ordning:** PeriodList-knappar → ReTransferButton.
MetricCards hoppas över (ej fokuserbara).

**Findings:**

- **F-Dash1** (c2): Spec § 2.4 specificerar att "varje widget är
  fokuserbar som enhet" med "Enter på widget navigerar till respektive
  detalj-vy". Detta är **ny interaktivitet**, inte en awkward-fix.
  `MetricCard` är idag presentational — kräver `role="button"` +
  `tabIndex={0}` + onClick-handler + `onKeyDown` för Enter. **Eskaleras
  till Sprint J (c2) som feature-add.**
- **F-Dash2** (c1, denna sprint): Dashboard saknade main-landmark.
  **Fixat via AppShell:** `<main id="main-content">` wrappar sida-
  innehåll. Skip-link "Hoppa till huvudinnehåll" hoppar hit.

---

## Skip-links — införande (c1-leveranser)

Tre skip-länkar införs som första fokuserbara element i `AppShell`:

1. **Hoppa till huvudinnehåll** (alltid synlig vid fokus) → `#main-content`
2. **Hoppa till massåtgärder** (conditional, syns bara när bulk-bar är
   aktiv) → `#bulk-actions`
3. **Hoppa till navigering** (alltid synlig vid fokus) → `#primary-nav`

Conditional-visibility styrs via `SkipLinksContext` —
InvoiceList och ExpenseList registrerar `bulkActionsActive=true`
via `useEffect` när `selectedIds.size > 0`.

**DOM-ordning:** huvudinnehåll → massåtgärder (om aktiv) → navigering.
Placeras först i `<div className="flex h-screen">`-wrappern så att Tab
från `<body>` når dem innan sidebar.

**Styling:** `sr-only focus:not-sr-only` — visuellt dolda tills
fokuserade. Vid fokus position: fixed, top-2, left-2, z-50.

---

## Sammanfattning

| Finding | Scope | Status |
|---|---|---|
| F-L1 rad-keyboard-nav | c2 (Sprint J) | Eskalerad |
| F-L2 rad-action-tab-ordning | c2 (Sprint J) | Eskalerad |
| F-L3 bulk-landmark | c1 | ✅ Fixat |
| F-F1 rad-fält-ordning | - | No-op (spec-OK) |
| F-F2 totals aria-live | c2 (Sprint J) | Eskalerad |
| F-D1 dialog edge-cases | c3 (Sprint K) | Eskalerad |
| F-Dash1 widget-fokuserbarhet | c2 (Sprint J) | Eskalerad |
| F-Dash2 main-landmark | c1 | ✅ Fixat |
| Skip-links införande | c1 | ✅ Fixat |

**c1-leveranser (Sprint I):**

- Skip-links × 3 (main + bulk + nav) i AppShell
- Landmarks: `<main id="main-content">`, `<nav id="primary-nav">`,
  `<div id="bulk-actions">`
- `SkipLinksContext` för bulk-bar registrering
- Tester: unit + E2E

**Ingen `tabIndex`-manipulation eller annan tab-ordning-ändring i c1.**
Alla behavioral-ändringar (roving-tabindex, widget-Enter-nav,
aria-live totals) skjuts till Sprint J (c2).
