# F49-c — Keyboard-navigation UX-spec

**Status:** Draft (Sprint F P5, 2026-04-18)
**Ursprung:** T3.g backlog (Sprint E summary). F49-c nämndes som reservslot
i [s22c-voiceover-notes.md](s22c-voiceover-notes.md) men hade ingen
konkret scope-definition. Denna spec stänger det gapet — implementation
sker i separata sprintar (F49-c1/c2/c3) efter att specen är godkänd.

**Blocker för Sprint I (implementation):** UX-spec godkänd + Alt B för
arrow-keys bekräftat (se § Arrow-keys nedan).

---

## 1. Scope-definition

F49-c omfattar **fyra ytor** i nuvarande renderer:

### 1.1 Lists
- [InvoiceList.tsx](../src/renderer/components/invoices/InvoiceList.tsx)
- [ExpenseList.tsx](../src/renderer/components/expenses/ExpenseList.tsx)
- Bulk-action-bar (visas vid selektion)

### 1.2 Forms
- [InvoiceForm.tsx](../src/renderer/components/invoices/InvoiceForm.tsx)
- [ExpenseForm.tsx](../src/renderer/components/expenses/ExpenseForm.tsx)
- [ManualEntryForm.tsx](../src/renderer/components/manual-entries/ManualEntryForm.tsx)

### 1.3 Dialogs (bank-reconciliation-yta)
- Match-dialog i [PageBankStatements.tsx](../src/renderer/pages/PageBankStatements.tsx)
- ConfirmDialog (alertdialog-mönstret — Sprint F P2 + P4 användning)
- BulkPaymentDialog

### 1.4 Dashboard
- [PageOverview](../src/renderer/pages/PageOverview.tsx) widget-navigering

**Uteslutet (inte F49-c):**
- PageSettings-fält (standard-form, kräver ingen custom keyboard-logik)
- PageAccounts, PageCustomers (samma mönster som InvoiceList — spec
  appliceras direkt om F49-c2 utvecklas till generell list-pattern)
- Global search-overlay (egen sprint om prioriterat)
- Print/PDF-fokus i invoice-PDF-preview

---

## 2. Tab-ordning per yta

### 2.1 InvoiceList / ExpenseList

Tab-ordning top→bottom, left→right:
1. Statusfilter-knappar (`Alla / Utkast / Obetald / ...`)
2. Sök-input
3. (om visible) Bulk-action-bar: `Ångra selektion` → `Betala` → `Exportera PDF`
4. Tabellhuvud — **ej fokuserbart** (rad-navigering via roving-tabindex,
   se § 4)
5. Först fokuserbara tabellrad
6. Pagination: `Föregående` → `Nästa`
7. `Ny faktura/kostnad`-knapp (footer)

**Viktigt:** Tab förbigår rad-listan när inga rader finns. Istället
hoppar fokus direkt till pagination eller footer.

### 2.2 Forms

Tab-ordning linjär top→bottom:
1. Rubrik-knappar (t.ex. `Avbryt` / `Spara utkast` — om i top)
2. Motparts-fält (counterparty search + add)
3. Datum-fält (invoice_date, due_date)
4. Beskrivning
5. Rad-header (ej fokuserbar)
6. För varje rad: `Artikel/Konto` → `Beskrivning` → `Antal` → `À-pris` → `Moms` → `Ta bort`-ikon
7. `+ Lägg till rad`-knapp
8. Totals-preview (ej fokuserbar; men `aria-live="polite"` så skärmläsare
   meddelar ändringar)
9. Footer: `Avbryt` → `Spara utkast` → `Finalisera`

**Per-rad-navigering:** Tab inom en rad går fält-för-fält. Shift+Tab
backar. När fokus når `Ta bort`-ikonen och användaren trycker Tab
fortsätter fokus till nästa rads första fält (inte till `+ Lägg till
rad` förrän alla rader är genom-tabbade).

### 2.3 Dialogs

- **Första fokus:** Cancel-knapp (enligt nuvarande ConfirmDialog-
  mönster, bibehåll).
- **Tab roterar inom dialogen** (focus-trap).
- **Escape stänger.**
- **Enter på primär-knapp aktiverar** (standard browser-beteende).

### 2.4 Dashboard

- Widget-navigering: Tab går mellan widgets (faktura-summa, kostnader,
  VAT-status, ...).
- Varje widget är fokuserbar som enhet — inte varje enskild siffra.
- Enter på widget navigerar till respektive detalj-vy (PageInvoices etc.).

---

## 3. Enter-aktivering på list-rader

**Beslut:** Enter på en list-rad = samma som klick på raden =
navigera till detalj-vyn.

**Motivering:**
- Semantiskt rimlig (rad som helhet är en navigations-länk)
- Matchar Radix-Dialog-mönstret (Enter på primär-knapp)
- Screen reader-vänligt: rad-roll blir `link` när vi lägger till
  `<Link>`-wrapper runt innehållet (istället för `onClick` på `<tr>`)

**Konsekvens:** `<tr>`-elementet får inte vara interaktivt direkt.
Istället wrappas rad-innehållet i en `<Link>`-komponent med
`display: table-row`-styling, eller cellerna görs till `<td>`:er
inom en `<a>`-semantik via role-attribut. **Implementationsdetalj
beslutas i F49-c2.**

**Undantag:** När selektions-checkbox finns på raden (bulk-mode),
Space aktiverar checkbox istället. Enter aktiverar rad-navigering
bara när ingen selektion är aktiv, eller via explicit "Öppna"-knapp
i actions-kolumnen.

---

## 4. Arrow-keys i tabeller

Tre alternativ övervägda:

| Alt | Beskrivning | Komplexitet | Rekommendation |
|---|---|---|---|
| A | Ingen arrow-key-support (nuvarande) | 0 SP | ✗ Sämre UX än standard |
| B | ↑↓ byter fokus-rad (roving-tabindex) | ~1 SP | ✓ **Rekommenderas** |
| C | Full grid-mönster (↑↓←→ + Home/End/PgUp/PgDn) | ~3 SP | ✗ Onödig komplexitet |

### Alt B — roving-tabindex per list-rad

Mönster:
- Enbart en rad har `tabIndex=0` vid varje tidpunkt (den "aktiva" raden)
- Alla andra rader har `tabIndex=-1`
- ↑↓ flyttar den aktiva-indexen, uppdaterar `tabIndex`-värden, och
  fokuserar den nya raden
- Tab lämnar listan direkt (utan att iterera genom rader)

**Implementation-skiss:**
```tsx
const [activeIdx, setActiveIdx] = useState(0)
const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

function handleKeyDown(e: KeyboardEvent, idx: number) {
  if (e.key === 'ArrowDown' && idx < rows.length - 1) {
    e.preventDefault()
    setActiveIdx(idx + 1)
    rowRefs.current[idx + 1]?.focus()
  }
  // ... ArrowUp, Home, End
}

<tr
  ref={(r) => { rowRefs.current[idx] = r }}
  tabIndex={idx === activeIdx ? 0 : -1}
  onKeyDown={(e) => handleKeyDown(e, idx)}
>
```

**Varför inte Alt C:** Grid-mönster kräver att hela tabellen re-
arkitekteras till `role="grid"` + `role="rowheader"` + `role="gridcell"`,
vilket bryter befintlig tabell-styling och kräver omskrivning av
sort-header-logik. ROI för keyboard-användare är oklar — rad-nivå-
navigering (Alt B) täcker 95% av användningen.

**Home/End inom listan:** Alt B utökas med:
- `Home` → fokus första raden
- `End` → fokus sista raden

PgUp/PgDn lämnas till browser-default (scrollar tabellen) — inte
rad-navigering.

---

## 5. Skip-links

Tre skip-länkar införs i AppShell:

### 5.1 "Hoppa till huvudinnehåll"
- Första fokuserbara elementet i `<body>` (före sidebar)
- Visuellt dold tills fokuserad (`sr-only focus:not-sr-only`)
- Tab från body → skip-link visas → Enter → fokus hoppar till
  `<main id="main-content">`

### 5.2 "Hoppa till navigering"
- Andra skip-länken
- Target: sidebar (`<nav id="primary-nav">`)
- Används mest av skärmläsare-användare som vill komma till nav utan
  att iterera förbi main-content-innehåll

### 5.3 "Hoppa till bulk-action-bar" (conditional)
- Visas **endast** när bulk-action-bar är aktiv (rader selekterade)
- Placeras näst efter main-content-skip
- Target: `<div id="bulk-actions">`

**M-princip-lock:** Skip-links är NI (not-implemented) i dagens
renderer. Införandet är en tillägg utan regression — befintliga
användare märker det inte om de inte börjar med Tab från body.

---

## 6. Focus-trap-edge-cases i Radix

Radix UI-dialogs (ConfirmDialog-mönstret vi använder) har focus-trap
inbyggt. Kända edge-cases:

### 6.1 Första-fokus-beslut
Nuvarande ConfirmDialog fokuserar alltid `Cancel`-knappen. Alt:
fokusera primär-knappen (`Confirm`). **Beslut: behåll Cancel-fokus.**
Motivering: destruktiva operationer (radera, ångra) bör kräva aktivt
val — default Cancel minskar risk för oavsiktlig Enter.

**Undantag:** För info-dialoger (inte confirm) → primär-knapp kan vara
default. Inte aktuellt i dagens kodbas.

### 6.2 Nested dialogs
ConfirmDialog inom Dialog (t.ex. "är du säker på att du vill avbryta
utan att spara?" inom InvoiceForm-dialogen): fokus återgår korrekt till
den yttre dialogens primär-trigger efter Escape — **verifierat i Sprint
22c axe-tester**.

### 6.3 Dialog-close → focus-return
När dialogen stängs (via Escape eller klick utanför), fokus ska återgå
till triggern som öppnade dialogen. Radix gör detta automatiskt om
dialogen monteras som child av triggern.

**Known issue:** Om triggern unmountas medan dialogen är öppen (t.ex.
bulk-unmatch-dialog i tom batch-vy) tappar fokus återgångspunkt och
hamnar på `<body>`. **Acceptabelt** — dokumenteras som teknisk
begränsning, inte bugg.

### 6.4 Tab-roll inom nested-trap
Tab i yttre dialog går inom yttre trap. När nested dialog öppnas tar den
över trap. Escape från nested stänger nested + re-aktiverar yttre trap.

---

## 7. M-princip-kandidat

**M156 (draft):** Keyboard-navigation-kontrakt för renderer.

- **Tab-ordning** följer DOM-ordning såvida det inte är semantiskt
  felaktigt (t.ex. actions-kolumn i tabell ska inte Tab-bes förrän
  raden är fokuserad).
- **Tabell-rader** använder **roving-tabindex** för rad-nivå-navigering
  (Alt B ovan). Inte grid-mönster.
- **Dialogs** har focus-trap + Escape-close + default-fokus på
  Cancel (destruktiva) eller primär (informativa).
- **Skip-links** i AppShell för main, nav, och conditional
  bulk-actions.
- **Enter på list-rad** = navigera till detalj-vy (samma som klick).

Promoteras till accepterad M-princip efter att F49-c1/c2/c3 alla är
implementerade och regression-tester finns.

---

## 8. Sprint-split

F49-c implementeras i **3 separata sprintar**:

### Sprint I — F49-c1: Skip-links + Tab-ordning audit (~1 SP)
- Införa 3 skip-links i AppShell
- Audit befintlig Tab-ordning mot § 2 — fixa awkward skip-cases
- Regressionstest: skip-link visas vid fokus, hoppar rätt
- **Ingen arrow-key-support än** — det kommer i c2
- **Leverabel:** Tab-ordning dokumenterad + testad i 4 ytor

### Sprint J — F49-c2: Roving-tabindex för lists (~2 SP)
- Implementera roving-tabindex i InvoiceList + ExpenseList
- Pil-upp/ner + Home/End
- Enter på rad → navigera till detaljvy
- Regression-tester: rad-fokus, rad-navigering, klick fortsätter fungera
- **Leverabel:** Pil-navigering i listor + Enter-activation

### Sprint K — F49-c3: Dialog focus-trap-härdning (~0.5 SP)
- Axe-körning på samtliga Radix-dialoger i kodbasen
- Fix edge-cases som dyker upp (e.g., nested dialogs, unmount-cleanup)
- Regression-test för varje dialog: öppna + Escape + verifiera fokus-återgång
- **Leverabel:** Full focus-trap-dekning i dialogs

**Total estimat:** ~3.5 SP = ungefär en sprint. Split möjliggör
prioritetsbyte (c1 + c3 är lågrisk — kan ro-as oberoende av c2).

---

## 9. Test-strategi

### 9.1 E2E-tester (Playwright)
Lägg till `keyboard-nav.spec.ts` med följande scenarier:
- Tab genom InvoiceList → pagination fokusterad efter rader
- Pil-ner på InvoiceList → fokus flyttas till nästa rad
- Enter på rad → navigerar till detalj-vy
- Skip-link visas vid Tab från body
- Dialog Tab → rotation inom dialog
- Dialog Escape → fokus återgår till trigger

### 9.2 Axe-tester (per komponent)
- M133 + M133-ast bibehålls
- Varje F49-c-sprint lägger till axe-run om komponenten saknas

### 9.3 Manuell VoiceOver-sampling
- Per-sprint: 1 flow-test via VoiceOver (MacOS native)
- Dokumenteras i CHECKLIST.md (per s22c-voiceover-notes.md-mönstret)

---

## 10. Öppna frågor (för William)

Följande behöver beslut innan Sprint I påbörjas. Preliminära svar
i parentes — konfirmeras vid sprint-start.

1. **Alt B för arrow-keys bekräftat?** (preliminärt: ja — Alt C är
   överkurs, Alt A underkurs)
2. **Roving-tabindex eller grid-mönster?** (preliminärt: roving)
3. **Skip-link 3 (bulk-actions) — conditional eller alltid synlig?**
   (preliminärt: conditional, visas bara när bulk-mode aktiv)
4. **Första-fokus i ConfirmDialog — Cancel bibehålls?** (preliminärt: ja)
5. **Home/End i listor — inkluderas i c2?** (preliminärt: ja)
6. **PgUp/PgDn — browser-default (scroll) eller rad-hopp?** (preliminärt:
   browser-default, inget custom beteende)

---

## 11. Icke-mål (explicit uteslutet)

- **Grid-mönster** (Alt C) — avfärdat, se § 4
- **Vim-liknande keybindings** (gg/G, j/k) — utanför scope
- **Global shortcut-system** (Cmd+K search, etc.) — egen sprint
- **Mouse-only-path-rättelser** — F49-c är keyboard-specifik
- **Mobile** — Electron desktop-only per s22b-scope-lås
- **I18n av skip-link-text** — svenska-only per s22b

---

## 12. Referenser

- [s22b-f49-strategy.md § Non-goals](s22b-f49-strategy.md) —
  keyboard-nav flyttad från non-goal (F49) till in-scope-F49-c (denna spec)
- [s22c-voiceover-notes.md](s22c-voiceover-notes.md) — F49-c nämnt
  som reservslot
- M133 (axe-regression-gate)
- M156 (draft, denna spec)
- [Radix UI keyboard support docs](https://www.radix-ui.com/primitives/docs/overview/accessibility#keyboard-interaction)
- [WAI-ARIA roving tabindex pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/data-grids/)
