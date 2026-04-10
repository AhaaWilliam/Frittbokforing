# System Tests — Documentation (Session 29)

## Schema: PRAGMA user_version = 13, 22+ tables

### Tables (after all 13 migrations):
1. companies
2. users
3. accounts (~95 BAS-konton seeded)
4. fiscal_years
5. accounting_periods
6. verification_sequences
7. journal_entries
8. journal_entry_lines
9. counterparties
10. invoices
11. invoice_payments
12. vat_codes (7 codes seeded)
13. opening_balances
14. products
15. price_lists
16. price_list_items
17. invoice_lines
18. expenses
19. expense_lines
20. expense_payments
21. manual_entries
22. manual_entry_lines

### Triggers (10 total, after migration 012 recreation):
1. trg_immutable_booked_entry_update — blocks UPDATE on booked JE (except opening_balance)
2. trg_immutable_booked_entry_delete — blocks DELETE on booked JE (except opening_balance)
3. trg_immutable_booked_line_update — blocks UPDATE on lines of booked JE (except opening_balance)
4. trg_immutable_booked_line_delete — blocks DELETE on lines of booked JE (except opening_balance)
5. trg_immutable_booked_line_insert — blocks INSERT on lines of booked JE (except opening_balance)
6. trg_prevent_invoice_delete — blocks DELETE on non-draft invoices
7. trg_check_balance_on_booking — enforces debit=credit + min 2 lines on booking
8. trg_check_period_on_booking — enforces FY open, date within FY, period open
9. trg_validate_org_number — format validation on companies.org_number

### Verification Series:
- A: Customer invoices + payments
- B: Supplier expenses + payments
- C: Manual entries
- O: Opening balances

### IPC Channels (~49):
See src/main/ipc-handlers.ts for complete list.
