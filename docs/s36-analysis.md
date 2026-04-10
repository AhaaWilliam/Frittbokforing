# S36 Kodbasanalys

## Baseline
- Tester: 780 passed, 2 skipped (vitest)
- Lint: 174 pre-existing errors (alla i testfiler, no-unused-vars)
- Build: OK

## Hook-inventering

### Queries (24 st)
| Hook | queryKey | ipcCall? | enabled guard? | staleTime? |
|------|----------|----------|----------------|------------|
| useCompany | ['company'] | NEJ (returnerar direkt) | nej | - |
| useFiscalYears | ['fiscal-years'] | NEJ | nej | - |
| useNetResult | ['net-result', fyId] | JA | !!fiscalYearId | - |
| useFiscalPeriods | ['fiscal-periods', fyId] | NEJ | !!fiscalYearId | - |
| useCounterparties | ['counterparties', params] | NEJ | nej | - |
| useCounterparty | ['counterparty', id] | NEJ | !!id | - |
| useProducts | ['products', params] | NEJ | nej | - |
| useProduct | ['product', id] | NEJ | !!id | - |
| useVatCodes | ['vat-codes', direction] | NEJ | nej | - |
| useAccounts | ['accounts', fiscalRule, class, isActive] | NEJ | nej | - |
| useAllAccounts | ['accounts-all', isActive] | NEJ | nej | - |
| useDraftInvoices | ['invoices','drafts', fyId] | NEJ | !!fiscalYearId | - |
| useDraftInvoice | ['invoice', id] | NEJ | !!id | - |
| useInvoicePayments | ['payments', invoiceId] | JA | !!invoiceId | - |
| useInvoiceList | ['invoices','list', fyId, filters] | JA | !!fiscalYearId | - |
| useNextInvoiceNumber | ['invoice-next-number', fyId] | NEJ | !!fiscalYearId | - |
| useExpenseDrafts | ['expense-drafts', fyId] | NEJ | !!fiscalYearId | - |
| useExpenseDraft | ['expense-draft', id] | NEJ | !!id | - |
| useExpense | ['expense', id] | JA | !!id | - |
| useExpensePayments | ['expense-payments', expenseId] | JA | !!expenseId | - |
| useExpenses | ['expenses', fyId, ...filters] | JA | !!fiscalYearId | - |
| useDashboardSummary | ['dashboard','summary', fyId] | JA | !!fiscalYearId | 30s |
| useVatReport | ['vat','report', fyId] | JA | !!fiscalYearId | 30s |
| useTaxForecast | ['tax','forecast', fyId] | JA | !!fiscalYearId | 30s |
| useManualEntryDrafts | ['manual-entry-drafts', fyId] | NEJ | !!fiscalYearId | - |
| useManualEntries | ['manual-entries', fyId] | NEJ | !!fiscalYearId | - |
| useManualEntry | ['manual-entry', id] | JA | !!id | - |
| useIncomeStatement | ['income-statement', fyId, dateRange] | JA | !!fiscalYearId | 30s |
| useBalanceSheet | ['balance-sheet', fyId, dateRange] | JA | !!fiscalYearId | 30s |

**Totalt: 29 queries** (12 med ipcCall, 17 utan)

### Mutations (26 st)
| Hook | invaliderar | param closeover? |
|------|-------------|------------------|
| useCreateCompany | ['company'] | - |
| useUpdateCompany | ['company'] | - |
| useSwitchFiscalYear | ALLT (invalidateQueries()) | - |
| useCreateNewFiscalYear | ALLT (invalidateQueries()) | - |
| useReTransferOpeningBalance | ALLT (invalidateQueries()) | - |
| useClosePeriod | ['fiscal-periods', fyId] | fyId |
| useReopenPeriod | ['fiscal-periods', fyId] | fyId |
| useCreateCounterparty | ['counterparties'] | - |
| useUpdateCounterparty | ['counterparties'], ['counterparty', id] | - |
| useDeactivateCounterparty | ['counterparties'] | - |
| useCreateProduct | ['products'] | - |
| useUpdateProduct | ['products'], ['product', id] | - |
| useDeactivateProduct | ['products'] | - |
| useSetCustomerPrice | ['product', productId] | productId |
| useRemoveCustomerPrice | ['product', productId] | productId |
| useSaveDraft | ['invoices','drafts', fyId] | fyId |
| useUpdateDraft | ['invoices','drafts', fyId], ['invoice', id] | fyId |
| useDeleteDraft | ['invoices','drafts', fyId] | fyId |
| usePayInvoice | ['invoices'], ['invoice'], ['payments'] | - |
| useFinalizeInvoice | ['invoices'], ['invoice'] | _fyId (unused) |
| useUpdateSentInvoice | ['invoice', id], ['invoices'] | - |
| useSaveExpenseDraft | ['expense-drafts'], ['expenses'] | - |
| useUpdateExpenseDraft | ['expense-drafts'], ['expense-draft'], ['expenses'] | - |
| useDeleteExpenseDraft | ['expense-drafts'], ['expenses'] | - |
| useFinalizeExpense | ['expense-drafts'], ['expenses'] | - |
| usePayExpense | ['expense-drafts'], ['expenses'], ['expense'], ['expense-payments'] | - |
| useExportWriteFile | INGET (mutation utan invalidering) | - |
| useSaveManualEntryDraft | ['manual-entry-drafts'] | - |
| useUpdateManualEntryDraft | ['manual-entry-drafts'], ['manual-entry'] | - |
| useDeleteManualEntryDraft | ['manual-entry-drafts'] | - |
| useFinalizeManualEntry | ['manual-entry-drafts'], ['manual-entries'], ['dashboard'] | - |

**Totalt: 26 mutations** (alla med ipcCall)

### Sammanfattning: 29 queries + 26 mutations = 55 hooks totalt

## ipcCall-mönster

**ipcCall-signaturen** (ipc-helpers.ts):
```typescript
async function ipcCall<T>(fn: () => Promise<IpcResult<T>>): Promise<T>
```
Tar en **funktion** som returnerar `Promise<IpcResult<T>>`, inte ett Promise direkt.

**Queries utan ipcCall (17 st):**
Dessa anropar window.api direkt och TanStack Query hanterar returtypen.
MEN: window.api returnerar IpcResult<T> för ALLA kanaler (se preload).
Dessa queries unwrappar INTE result.success — de returnerar hela IpcResult till komponenten.

**OBS: Detta är en bugg/inkonsistens.** Komponenter som konsumerar dessa queries
får `{ success: true, data: [...] }` istället för bara `[...]`.
useIpcQuery MÅSTE wrappa alla queries med ipcCall för korrekthet.

## Direkt window.api utanför hooks.ts

| Fil | Rad | Metod | Åtgärd |
|-----|-----|-------|--------|
| FiscalYearContext.tsx | 24,46,52 | getSetting, setSetting | Ny hook |
| PageSettings.tsx | 12,21,24 | getSetting, backupCreate, setSetting | Ny hook |
| InvoiceList.tsx | 99,119,157,159 | finalizeInvoice, payInvoice, generateInvoicePdf, saveInvoicePdf | Befintliga hooks finns (finalize, pay), PDF behöver ny hook |
| ExpenseList.tsx | 100,120 | finalizeExpense, payExpense | Befintliga hooks finns |
| ArticlePicker.tsx | 83 | getPriceForCustomer | Ny hook |

## Navigation-mönster

**AppShell:** `useState<PageId>('overview')` + switch-case i PageContent
**Sidebar:** Tar `activePage` + `onNavigate` props, renderar NavItems

### Per-page subview patterns:

| Page | State-typ | Mönster |
|------|-----------|---------|
| PageIncome | `'list' \| 'form' \| { edit: N } \| { view: N }` | Discriminated union |
| PageExpenses | `'list' \| 'form' \| { edit: N } \| { view: N }` + payingExpenseId | Discriminated union + modal |
| PageManualEntries | `'list' \| 'form' \| { edit: N }` | Discriminated union |
| PageCustomers | selectedId + isCreating + isEditing | Multi-state booleans |
| PageSuppliers | selectedId + isCreating + isEditing | Multi-state booleans |
| PageProducts | selectedId + isCreating + isEditing + typeFilter | Multi-state booleans |
| PageAccounts | showInactive + search + dialogOpen + editAccount | Dialog modal |
| PageReports | tab: 'income-statement' \| 'balance-sheet' | Tab |
| PageSettings | Monolitisk form, ingen subview | - |
| PageOverview | Ingen subview | - |
| PageVat | Ingen subview | - |
| PageTax | Ingen subview | - |
| PageExport | Ingen subview | - |

### Beslut för NavigationContext:
NavigationContext hanterar ENBART top-level page navigation (ersätter AppShell useState).
Subview-navigation (form/edit/view) behålls per-Page tills vidare — för komplex att
generalisera pga olika mönster (discriminated union vs multi-state booleans).

S40 kan eventuellt unifiera subview till hash-routes, men S36 fokuserar på att:
1. Abstrahera `setPage` → `navigate(page)`
2. Lägga till `back()` historik
3. Ge alla pages tillgång via `useNavigate()`
