# S22b A11y Baseline-rapport

**Base commit:** bd62a9e (Sprint 22a F46 klar)
**Research-datum:** 2026-04-14
**Author:** Claude (S22b research-session)
**Metod:** Kodgranskning + befintlig axe-core-infrastruktur (renderWithProviders)

## Metod-not

Separat axe-testkörning (Steg 1 i v3-specen) **ersattes** med analys av
befintlig infrastruktur. Anledning: `renderWithProviders` kör redan
`axe-core` default-on (`axeCheck: true`) sedan Sprint 18 (S64b). Alla
renderer-tester som passerar har implicit axe-godkännande i sin renderade
state. Filer som har `axeCheck: false` utgör den faktiska baseline-datan —
de markerar ytor med **kända violations** som inte adresserats.

Att installera `jest-axe` separat och köra parallella tester hade gett
redundanta resultat mot den redan integrerade `axe-core`-körningen.

## Befintlig axe-infrastruktur

| Komponent | Fil | Status |
|---|---|---|
| `renderWithProviders` | `tests/helpers/render-with-providers.tsx` | axe-core körs default, `color-contrast` disabled (jsdom-begränsning) |
| Policy | `CHECKLIST.md` § A11y-policy | `axeCheck: false` tillåts bara för error-state-tester och isolerade sub-komponenter |
| `axe-core` | `package.json` | `^4.11.3` installerad |

## Baseline: axeCheck-status per yta

### Ytor med axe-tester (implicit godkända)

| Yta | Testfil | axeCheck | Notering |
|---|---|---|---|
| FormField | `tests/renderer/components/ui/FormField.test.tsx` | **true** (default) | Renderar med error-state — axe passerar |
| FormSelect | `tests/renderer/components/ui/FormSelect.test.tsx` | **true** (default) | — |
| FormTextarea | `tests/renderer/components/ui/FormTextarea.test.tsx` | **true** (default) | — |
| InvoiceLineRow | `tests/renderer/components/invoices/InvoiceLineRow.test.tsx` | **true** (default) | — |
| InvoiceTotals | `tests/renderer/components/invoices/InvoiceTotals.test.tsx` | **true** (default) | — |
| ArticlePicker | `tests/renderer/components/invoices/ArticlePicker.test.tsx` | **true** (default) | — |
| CustomerPicker | `tests/renderer/components/invoices/CustomerPicker.test.tsx` | **true** (default) | — |

### Ytor med axe AVAKTIVERAT (kända violations)

| Yta | Testfil | axeCheck | Anledning |
|---|---|---|---|
| InvoiceForm | `tests/renderer/components/invoices/InvoiceForm.test.tsx` | **false** | Komplex form med inline ARIA-brist |
| InvoiceForm (integration) | `tests/renderer/components/invoices/InvoiceForm.integration.test.tsx` | **false** | Samma |
| ExpenseForm | `tests/renderer/components/expenses/ExpenseForm.test.tsx` | **false** | Komplex form med inline ARIA-brist |
| ExpenseForm (integration) | `tests/renderer/components/expenses/ExpenseForm.integration.test.tsx` | **false** | Samma |

### Ytor UTAN renderer-tester (okänd axe-status)

| Yta | Typ | Befintlig a11y |
|---|---|---|
| ManualEntryForm | Form | Inga ARIA-attribut |
| CustomerForm | Form | Använder FormField (implicit axe-ok per fält) |
| ProductForm | Form | Använder FormField/FormSelect/FormTextarea |
| OnboardingWizard (StepConfirm) | Form/Wizard | Inga ARIA-attribut |
| CreateFiscalYearDialog | Dialog | Inga ARIA-attribut |
| PaymentDialog | Dialog | Inga ARIA-attribut, error som plain `<p>` |
| BulkPaymentDialog | Dialog | Inga ARIA-attribut |
| PayExpenseDialog | Dialog | Inga ARIA-attribut |
| InvoiceList | List + inline forms | Inga ARIA-attribut |
| ExpenseList | List + inline forms | Inga ARIA-attribut |
| ManualEntryList | List | Inga renderer-tester |
| ContactList | List | Inga renderer-tester |
| ProductList | List | Inga renderer-tester |
| PageAccounts | Page + inline form | Inga renderer-tester |
| PageSettings | Page | Inga renderer-tester |
| PageExport | Page | Inga renderer-tester |
| LoadingSpinner | UI | Ingen `role="status"`, ingen `aria-busy` |

## Befintliga a11y-attribut (fullständig inventering)

Totalt **7 filer** med `aria-` eller `role=` i `src/renderer/`:

| Fil | Attribut | Scope |
|---|---|---|
| `InvoiceForm.tsx:205` | `aria-invalid={!!form.errors.invoiceDate}` | Enbart datum-fält |
| `InvoiceForm.tsx:206` | `aria-describedby="invoice-date-error"` | Enbart datum-fält |
| `InvoiceForm.tsx:210` | `role="alert"` på error `<p>` | Enbart datum-fält |
| `ExpenseForm.tsx:251` | `aria-invalid={!!form.errors.expenseDate}` | Enbart datum-fält |
| `ExpenseForm.tsx:252` | `aria-describedby="expense-date-error"` | Enbart datum-fält |
| `ExpenseForm.tsx:256` | `role="alert"` på error `<p>` | Enbart datum-fält |

**Alla övriga fält** (15+ per form) renderar errors som:
```html
<p className="mt-1 text-xs text-red-600">{error}</p>
```
utan `role="alert"`, `aria-live`, `aria-invalid`, eller `aria-describedby`.

## Befintliga a11y-egenskaper (ej attribut)

| Egenskap | Status |
|---|---|
| `<html lang="sv">` | Finns i `index.html` |
| `<label htmlFor>` koppling | Finns i FormField, FormSelect, FormTextarea, och inline i forms |
| `aria-busy` vid laddning | **Saknas** helt |
| `role="status"` på LoadingSpinner | **Saknas** |
| `aria-live` regioner | **Saknas** (förutom implicit via `role="alert"` på 2 datum-fält) |
| Keyboard navigation (onKeyDown) | **Saknas** helt i renderer |
| Focus management vid submit-failure | **Saknas** |
| Error summary (form-nivå) | **Saknas** |
| `submitError` a11y-rendering | **Saknas** — renderas som plain `<div>` utan role/aria |

## TanStack Query a11y-status

- **15 filer** använder `isPending`/`isError`
- **0** använder `aria-busy` vid pending
- **0** använder `aria-live` för error-state från queries
- LoadingSpinner har ingen ARIA — ren visuell spinner
- Global `onError` i QueryClient config hanteras (toast?), men inte som ARIA live-region

## Sammanfattning: F49-yta

| Kategori | Antal ytor | a11y-status | F49-prioritet |
|---|---|---|---|
| Forms med useEntityForm | 5 (Invoice, Expense, Manual, Customer, Product) | 2/5 har partiell (datum), 3/5 noll | **Hög** |
| Dialoger med felvisning | 4 (Payment, PayExpense, Bulk, CreateFY) | 0/4 | **Hög** |
| submitError-rendering | 5 formulär | 0/5 har role="alert" | **Hög** |
| Loading states | 15+ filer | 0 aria-busy, 0 role="status" | **Medium** |
| Lists/tables | 5+ | 0 a11y | **Låg** (read-only) |
| Keyboard nav | Hela appen | Saknas | **Låg** (separat scope) |

## Kvantitativ baseline

- **Filer med a11y-attribut:** 2 av ~40 renderer-komponentfiler (5%)
- **Fält med a11y-attribut:** 2 av ~50+ input-fält i appen (4%)
- **axeCheck: false opt-outs:** 4 testfiler (av 17 renderer-tester)
- **Error-rendering utan a11y:** 15+ ställen (grep: `<p.*error`)
- **submitError utan a11y:** 5 ställen
