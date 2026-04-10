# State Audit — S40

## Frontend State Inventory

### Löst av router (S40)

| Fil | State-variabel | Typ | Kategori |
|-----|---------------|------|----------|
| EntityListPage (SubViewLayout) | `view` (SubViewState) | intern → route | Löst av router |
| EntityListPage (MasterDetailLayout) | `selectedId` | intern → route | Löst av router |
| EntityListPage (MasterDetailLayout) | `isCreating` | intern → route | Löst av router |
| EntityListPage (MasterDetailLayout) | `isEditing` | intern → route | Löst av router |
| NavigationContext | `currentPage` | context → route | Raderad (S40) |

### Korrekt lokal state

| Fil | State-variabel | Typ | Notering |
|-----|---------------|------|----------|
| router.tsx | `currentPath` | intern | Router-state, korrekt |
| FiscalYearContext | `selectedYear`, `restoredId` | context | Global app-state, korrekt |
| use-debounced-search | `search`, `debouncedSearch` | hook | UI-state, korrekt |
| use-entity-form | `formData`, `errors`, `submitError`, `isSubmitting` | hook | Form-state, korrekt |
| PageExpenses | `payingExpenseId` | intern | Dialog-state, korrekt |
| PageProducts | `typeFilter` | intern | Filter-state, korrekt |
| PageReports | `tab`, `fromDate`, `toDate` | intern | UI-state, korrekt |
| PageExport | `excelFrom`, `excelTo`, `feedback` | intern | UI-state, korrekt |
| IncomeStatementView | `expanded` | intern | UI-state, korrekt |
| BalanceSheetView | `expanded` | intern | UI-state, korrekt |
| ArticlePicker | `search`, `debouncedSearch`, `open` | intern | Dropdown-state, korrekt |
| CustomerPicker | `search`, `debouncedSearch`, `open` | intern | Dropdown-state, korrekt |
| SupplierPicker | `search`, `debouncedSearch`, `open`, `showInline`, `newName`, `newOrgNumber` | intern | Dropdown+inline-create, korrekt |
| PaymentDialog | `amountStr`, `paymentDate`, `errors` | intern | Form-state, korrekt |
| PayExpenseDialog | `amountKr`, `paymentDate`, `paymentMethod`, `accountNumber`, `error` | intern | Form-state, korrekt |
| CustomerDetail | `showConfirm` | intern | UI-state, korrekt |
| ProductDetail | `showConfirm` | intern | UI-state, korrekt |
| InvoiceList | `statusFilter`, `finalizeItem`, `payItem` | intern | Filter+dialog, korrekt |
| ExpenseList | `statusFilter`, `finalizeItem`, `payItem` | intern | Filter+dialog, korrekt |
| CustomerPriceTable | `isAdding`, `customerSearch`, `selectedCounterpartyId`, `priceKr`, `error` | intern | Inline-form, korrekt |
| PeriodList | `confirmId` | intern | UI-state, korrekt |
| YearPicker | `showCreateDialog` | intern | UI-state, korrekt |
| CreateFiscalYearDialog | `step`, `userChoseBook`, `showSkipWarning`, `error`, `resultData` | intern | Wizard-state, korrekt |
| ReTransferButton | `showConfirm` | intern | UI-state, korrekt |

### PageAccounts — Flaggad (390 rader, orörd)

| Fil | State-variabel | Typ | Problem | Kategori |
|-----|---------------|------|---------|----------|
| PageAccounts | `accountNumber`, `name`, `k2Allowed`, `k3Only`, `error` | form | Manuell form-state, bör använda `useEntityForm` | Redundant state |
| PageAccounts | `showInactive`, `search` | filter | OK som UI-state | — |
| PageAccounts | `dialogOpen`, `editAccount` | dialog | OK som UI-state | — |

### PageSettings — Flaggad

| Fil | State-variabel | Typ | Problem | Kategori |
|-----|---------------|------|---------|----------|
| PageSettings | 10× individuella `useState` (vatNumber, addressLine1, etc.) | form | Manuell form-state, bör använda `useEntityForm` | Redundant state |
| PageSettings | `lastBackup`, `backupMessage`, `isBackingUp` | async | OK, async operation state | — |
| PageSettings | `error`, `success` | feedback | OK, form feedback | — |

## Kategorisering

1. **Löst av router (S40):** 5 state-variabler — all navigation-state nu URL-driven
2. **Redundant state:** PageAccounts form-state (5 fält) och PageSettings form-state (10 fält) bör migreras till `useEntityForm`
3. **Derived state:** Inga uppenbara fall hittade
4. **Stale state:** Inga uppenbara fall — router-migrering eliminerade det vanligaste fallet
5. **Performance:** Inga uppenbara fall

## Prioriterad lista — framtida sprint

1. **PageAccounts refaktor** — Migrera till `useEntityForm`, bryt ut `AccountForm`-komponent. ~390 rader bör bli ~200.
2. **PageSettings refaktor** — Migrera form-fält till `useEntityForm`. 10 individuella `useState` → 1 form-state.
3. **SupplierPicker inline-create** — 6 useState i en picker-komponent; överväg att bryta ut inline-create till separat komponent.
