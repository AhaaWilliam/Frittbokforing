## 8. Commit-plan för S24b — BR-result-konsistens + F4 latent comparator-cleanup

**Ordnings-princip:** F4 (fundament) före F19 (konsumenter), men givet att
F4 enbart påverkar sortering och F19 enbart påverkar BR:s netResult-källa
finns inget reellt beroende. Ordningen väljs för pedagogisk tydlighet.

### Commits

| # | Commit-meddelande | Berörda filer | Testdelta |
|---|---|---|---|
| 1 | `feat: compareAccountNumbers helper + unit + property-tester` | `src/shared/account-number.ts`, `tests/s24b-account-comparator.test.ts` | +9 |
| 2 | `fix(F4): numerisk ORDER BY + localeCompare → compareAccountNumbers` | `account-service.ts`, `balance-queries.ts`, `export-data-queries.ts`, `report-service.ts` | +2 |
| 3 | `fix(F19): BR netResult via calculateResultSummary + konsistens-test` | `report-service.ts`, `tests/s24b-br-rr-consistency.test.ts` | +6 |
| 4 | `feat: data-testid för årets resultat i RR + BR` | `IncomeStatementView.tsx`, `BalanceSheetView.tsx` | +0 |
| 5 | `test(e2e): RR/BR årets resultat konsistens` | `tests/e2e/result-consistency.spec.ts` | +1 |
| 6 | `docs: S24b sprint-avslut + M134 i CLAUDE.md` | `STATUS.md`, `CLAUDE.md`, `docs/` | +0 |

**Total: 6 commits, +19 tester. Baseline 1493 → ~1512.**

### Detaljerad commit-beskrivning

**Commit 1 — compareAccountNumbers helper**

Ny fil `src/shared/account-number.ts`:
```ts
export function compareAccountNumbers(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}
```

Tester: 5 unit + 4 property (fast-check). fast-check läggs till som devDep
om ej redan installerad.

**Commit 2 — F4 SQL + application-layer fix**

5 SQL-ändringar (`ORDER BY account_number` → `ORDER BY CAST(account_number AS INTEGER)`):
- account-service.ts:33
- account-service.ts:49
- balance-queries.ts:43
- export-data-queries.ts:158
- export-data-queries.ts:220

1 application-layer-ändring:
- report-service.ts:127: `localeCompare` → `compareAccountNumbers`

2 sorteringsordning-tester.

**Commit 3 — F19 BR-fix + konsistens-tester**

report-service.ts:getBalanceSheet — ersätt rad 137–141:
```ts
// Before:
const plMovements = movements.filter(
  (m) => !m.account_number.startsWith('1') && !m.account_number.startsWith('2'),
)
const calculatedNetResult = plMovements.reduce((s, m) => s + m.net, 0)

// After:
const resultSummary = calculateResultSummary(db, fiscalYearId, dateRange)
const calculatedNetResult = resultSummary.netResultOre
```

Ny import: `calculateResultSummary` från `../result-service`.

3 BR/RR-konsistens-tester + 3 negativa kontrakt-tester.

**Commit 4 — UI-kontrakt data-testid**

IncomeStatementView.tsx rad 130–133: wrap "Årets resultat"-span med
`data-testid="arets-resultat-value"` och `data-raw-ore={data.netResult}`.

BalanceSheetView.tsx rad 140–141: wrap med
`data-testid="arets-resultat-br-value"` och
`data-raw-ore={equityAndLiabilities.calculatedNetResult}`.

**Commit 5 — E2E-test**

1 Playwright-test som verifierar att `data-raw-ore` är identiskt på
RR och BR.

**Commit 6 — Sprint-avslut**

- M134 i CLAUDE.md: "BR:s årets resultat beräknas via result-service"
- STATUS.md uppdaterad med testbaslinje och sprint-noteringar
- F19 markeras som stängd (BR-konsistens löst)
- F4 markeras som stängd (sorteringsfix + helper)

### Stoppvillkor för S24b

- [ ] Alla befintliga 1493 tester passerar (inga regressioner)
- [ ] M131-check passerar
- [ ] M133-check passerar
- [ ] BR/RR-konsistens-test passerar med klass 8-poster
- [ ] E2E verifierar data-testid-kontraktet
- [ ] fast-check property-tester passerar
