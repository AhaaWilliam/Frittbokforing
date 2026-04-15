# S22c Step 0 — Preflight Audit

**Datum:** 2026-04-15T06:51:00+02:00
**HEAD:** 4cae127744059217035e0586e772620d3a2b879e (4cae127)
**Not:** HEAD är ett docs-only-commit framför promptens be54a57. Säkert att fortsätta.
**Testbaslinje:** 1481 passed, 2 skipped
**M131:** OK

## Sektioner
- 0.2 Strategi-verifiering
- 0.3 renderWithProviders axe-integration + AA-tags
- 0.4 FormField-inventering
- 0.5 noValidate-risk-audit
- 0.6 aria-errormessage grep (ska vara tomt)
- 0.7 Dialog-inventering (resolverar N för commit 6)
- 0.8 Focus-selector-inventering per form
- 0.9 DeleteConfirm-focus-historik
- 0.10 M-nummer
- 0.11 Scope-summary + Go/No-go

## 0.2 Strategi-verifiering

- docs/s22b-f49-strategy.md: ✓
- docs/s22b-baseline.md: ✓
- AA spikat: ✓
- Arkitektur D spikat: ✓
- `axeCheck: false`-förekomster: **4** (opt-outs i testfiler)

### axeCheck: false-lista

```
tests/renderer/components/invoices/InvoiceForm.integration.test.tsx:85:    { axeCheck: false },
tests/renderer/components/invoices/InvoiceForm.test.tsx:138:    { axeCheck: false },
tests/renderer/components/expenses/ExpenseForm.test.tsx:122:    { axeCheck: false, queryClient },
tests/renderer/components/expenses/ExpenseForm.integration.test.tsx:52:    { axeCheck: false },
```

(Ytterligare 2 referens i tests/infra/render-with-providers.test.tsx — infrastruktur-test som testar själva axeCheck-flaggan, inte opt-out.)

## 0.3 renderWithProviders axe-integration

- Fil: `tests/helpers/render-with-providers.tsx`

```tsx
const AXE_OPTIONS: axe.RunOptions = {
  rules: {
    // jsdom does not compute styles — color-contrast always fails
    'color-contrast': { enabled: false },
  },
}
```

runOnly används inte → default AA-täckning aktiv: ✓

Default axe-core kör wcag2a + wcag2aa + wcag21a + wcag21aa + best-practice. Enbart `color-contrast` är disabled (jsdom-begränsning).

### axeCheck-prop-toggle

```tsx
axeCheck?: boolean  // default: true
// ...
if (axeCheck) {
  axeResults = await axe.run(result.container, AXE_OPTIONS)
  if (axeResults.violations.length > 0) {
    // ... throw Error med violations
  }
}
```

## 0.4 FormField-inventering

### Komponentfiler

```
src/renderer/components/ui/FormField.tsx
src/renderer/components/ui/FormSelect.tsx
src/renderer/components/ui/FormTextarea.tsx
```

**Korrigering (post-audit):** FormSelect och FormTextarea hittades vid djupare sökning. Alla tre uppgraderas i commit 1. Testbudget: +3 (en per komponent).

### Konsumenter (får a11y "gratis" via commit 1)

```
src/renderer/components/customers/CustomerForm.tsx
src/renderer/components/products/ProductForm.tsx
```

Exakt som förväntat per strategi.

## 0.5 noValidate-risk-audit

**Resultat:** 0 träffar (`toBeInvalid`, `:invalid`, `validity.`, `ValidityState`). Säkert att lägga noValidate på alla forms.

## 0.6 aria-errormessage-grep

**Resultat:** 0 träffar. `aria-describedby` blir ensam ARIA-länk → inga konflikter.

## 0.7 Dialog-inventering

### Alla dialog-filer

```
src/renderer/components/ui/ConfirmFinalizeDialog.tsx
src/renderer/components/ui/BulkPaymentResultDialog.tsx
src/renderer/components/ui/BulkPaymentDialog.tsx
src/renderer/components/ui/PaymentDialog.tsx
src/renderer/components/layout/CreateFiscalYearDialog.tsx
src/renderer/components/expenses/PayExpenseDialog.tsx
src/renderer/components/wizard/StepConfirm.tsx
```

### Dialog-mönster

Alla dialoger använder custom overlay-mönster (`fixed inset-0 z-50`). Ingen använder Radix eller headless-UI-bibliotek. Ingen har `role="dialog"`, `aria-modal`, `aria-labelledby`, eller focus-trap.

### Commit 5 (fixerat)

- OnboardingWizard (wizard/StepCompany, wizard/StepFiscalYear, wizard/StepConfirm) — via OnboardingWizard.tsx
- CreateFiscalYearDialog

### Commit 6 (N = alla övriga dialoger)

Filer:
1. `src/renderer/components/ui/ConfirmFinalizeDialog.tsx`
2. `src/renderer/components/ui/PaymentDialog.tsx`
3. `src/renderer/components/ui/BulkPaymentDialog.tsx`
4. `src/renderer/components/ui/BulkPaymentResultDialog.tsx`
5. `src/renderer/components/expenses/PayExpenseDialog.tsx`

**N för commit 6: `5`** (under 6 → ingen split behövs)

### DeleteConfirm

**Ingen DeleteConfirm-komponent finns.** Raderings-bekräftelser i InvoiceForm/ExpenseForm använder `window.confirm()` (inline). Dialog-baserad delete-confirm existerar inte — promptens "DeleteConfirm"-scope utgår. Commit 6 fokuserar på de 5 dialog-komponenterna ovan.

## 0.8 Focus-selector-inventering

### InvoiceForm (kundfaktura — customer)

- Första fält i DOM: CustomerPicker → `<input>` med `aria-label="Sök kund"`
- ARIA-roll: `textbox` (standard input)
- Label/accessible name: "Sök kund" (via aria-label)
- Vald selector för test: `getByRole('textbox', { name: /sök kund/i })`
- **OBS:** CustomerPicker renderar antingen selected-state (`<span>`) eller search-input. Vid create-mode (ingen customer vald) renderas input.

**Befintlig partiell ARIA:** `invoiceDate`-fältet har redan `aria-invalid` + `aria-describedby` + `role="alert"` på error-`<p>`. Övriga fält (customer, notes, lines) saknar ARIA helt.

### ExpenseForm (leverantörsfaktura — supplier)

- Första fält i DOM: SupplierPicker → `<input>` med `aria-label="Sök leverantör"`
- ARIA-roll: `textbox`
- Label: "Sök leverantör" (via aria-label)
- Selector: `getByRole('textbox', { name: /sök leverantör/i })`

**Befintlig partiell ARIA:** `expenseDate`-fältet har redan `aria-invalid` + `aria-describedby` + `role="alert"` på error-`<p>`. Övriga fält saknar.

### ManualEntryForm

- Första fält i DOM: `<input type="date">` med label "Datum"
- ARIA-roll: — (date input har ingen explicit roll i jsdom, men label "Datum" applicerar via `<label>`)
- Label: "Datum" — **men saknar htmlFor-association!** (label och input ej länkade via id)
- **Fix i commit 4:** Lägg `id="manual-entry-date"` på input + `htmlFor="manual-entry-date"` på label
- Selector: `getByLabelText(/datum/i)` (efter fix)

**Viktig design-decision:** Focus-useEffect itererar över **DOM-ordning** med `form.querySelector('[aria-invalid="true"]')[0].focus()` — inte Object.keys(errors).

## 0.9 DeleteConfirm-focus-historik

**Resultat:** Ingen DeleteConfirm-komponent finns i codebase. Inga befintliga focus-assertions att ta hänsyn till.

Destruktiva åtgärder (radera utkast) använder `window.confirm()`. Ingen dialog-komponent involverad.

→ Commit 6 fokuserar på payment/finalize-dialoger. Focus-default sätts på Cancel-knappen (destruktivt-skydd, Apple HIG-konvention) för ConfirmFinalizeDialog.

## 0.10 M-nummer

- Senaste M-regel i CLAUDE.md: **M132** (sektion 37, "Cross-schema-gränser i shared constants")
- Förväntat: M132 ✓
- M133 reserveras för F49 a11y-regression-skydd (commit 7)

## 0.11 Scope-summary + Go/No-go

### Test-budget per commit

| # | Commit | Delta | Efter |
|---|---|---|---|
| 1 | FormField + helpers + step0-output | +3 | 1484 |
| 2 | InvoiceForm | +2 | 1486 |
| 3 | ExpenseForm | +2 | 1488 |
| 4 | ManualEntryForm | +1 | 1489 |
| 5 | CompanyWizard + CreateFiscalYear | +2 | 1491 |
| 6 | Dialoger (N=5) | +1 | 1492 |
| 7 | Spinner + M133 | +1 | 1493 |
| 8 | Sprint-avslut | 0 | 1493 |

### Stopp-status

- [x] Working tree clean
- [x] HEAD verifierad (4cae127, docs-only ahead of be54a57)
- [x] Baseline 1481/2
- [x] M131 OK
- [x] Strategi-dokument existerar
- [x] axeCheck:false = 4
- [x] renderWithProviders + AA-täckning verifierad (default, no runOnly)
- [x] FormField-konsumenter identifierade (CustomerForm, ProductForm)
- [x] noValidate-risker audited (0 HTML5-assertions)
- [x] aria-errormessage = 0
- [x] Dialog-N resolverat (N=5)
- [x] Focus-selectors identifierade per form
- [x] DeleteConfirm — existerar ej (window.confirm istället)
- [x] M-nummer = M132

### Scope-anpassningar vs prompt

1. **Inga Select/Textarea-komponenter** — existerar ej som separata filer. Commit 1 uppgraderar enbart FormField. Inline select/textarea ARIA hanteras per formulär i commits 2–4.
2. **Ingen DeleteConfirm-komponent** — radering använder window.confirm(). Commit 6 scope: 5 dialog-komponenter (payment, finalize, bulk).
3. **HEAD +1 commit** — 4cae127 är docs-only, ingen kod-påverkan.
4. **Partiell ARIA existerar redan** — invoiceDate och expenseDate har redan aria-invalid + aria-describedby + role="alert". Commits 2–3 kompletterar övriga fält.

## 0.12 Avvikelse från reviderad budget

**Reviderad budget (efter Step 0):** +10 (1481 → 1491). Commit 1 sänktes från +3 till +1
eftersom Step 0.4 inte hittade FormSelect/FormTextarea.

**Faktiskt utfall:** +12 (1481 → 1493). Commit 1 blev +3.

**Orsak:** Step 0.4 sökte med `find -name "Select.*" -o -name "Textarea.*"` som
inte matchade `FormSelect.tsx` / `FormTextarea.tsx`. Vid commit 1-implementation
hittades komponenterna via `grep -rn "FormSelect\|FormTextarea"`. De hade
existerande tester (`FormSelect.test.tsx`, `FormTextarea.test.tsx`) som bekräftade
att de var i aktivt bruk.

**Lärdomar för framtida Step 0:**
- Sök med `find -name "*Select*" -o -name "*Textarea*"` (wildcard-prefix)
  eller `grep -rl "export function Form"` för att fånga alla namnvarianter.
- Dubbelkolla med `ls tests/renderer/components/ui/` — testfiler avslöjar
  komponenter som find-mönstret missade.

**Steg 0 klar. Väntar på go.**
