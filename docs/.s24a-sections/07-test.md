## 7. Test-strategi

### 7.1 Unit-tester för compareAccountNumbers

```ts
describe('compareAccountNumbers', () => {
  it('4 vs 4: numerisk ordning', () => {
    expect(compareAccountNumbers('1510', '3002')).toBeLessThan(0)
  })
  it('5-siffrig vs 4-siffrig: 30000 > 4000 numeriskt', () => {
    expect(compareAccountNumbers('30000', '4000')).toBeGreaterThan(0)
  })
  it('lika: returnerar 0', () => {
    expect(compareAccountNumbers('1930', '1930')).toBe(0)
  })
  it('lika prefix, olika suffix', () => {
    expect(compareAccountNumbers('1010', '1100')).toBeLessThan(0)
  })
  it('leading zeros preserved', () => {
    expect(compareAccountNumbers('0100', '0200')).toBeLessThan(0)
  })
})
```

**Mål:** ~5 unit-tester.

### 7.2 Property-based comparator-kontrakt

Använd `fast-check` (lägg till som devDep om saknas).

```ts
import fc from 'fast-check'

const validAccountNumber = fc.stringOf(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'),
  { minLength: 4, maxLength: 5 })

test('reflexivitet', () => {
  fc.assert(fc.property(validAccountNumber, (a) =>
    compareAccountNumbers(a, a) === 0))
})

test('antisymmetri', () => {
  fc.assert(fc.property(validAccountNumber, validAccountNumber, (a, b) =>
    Math.sign(compareAccountNumbers(a, b)) === -Math.sign(compareAccountNumbers(b, a))))
})

test('transitivitet', () => {
  fc.assert(fc.property(validAccountNumber, validAccountNumber, validAccountNumber, (a, b, c) => {
    if (compareAccountNumbers(a, b) <= 0 && compareAccountNumbers(b, c) <= 0) {
      return compareAccountNumbers(a, c) <= 0
    }
    return true
  }))
})

test('numerisk konsistens (M98-kontrakt)', () => {
  fc.assert(fc.property(validAccountNumber, validAccountNumber, (a, b) =>
    Math.sign(compareAccountNumbers(a, b)) === Math.sign(Number(a) - Number(b))))
})
```

**Mål:** 4 property-tester. Den fjärde (numerisk konsistens) är det formella
M98-beviset.

### 7.3 BR/RR-konsistens-test

```ts
it('BR.calculatedNetResult === RR.netResult', () => {
  // Revenue 200k + financial expense 10k + tax 20k
  bookEntry('2025-03-01', [
    { account: '1930', debit: 20_000_000, credit: 0 },
    { account: '3002', debit: 0, credit: 20_000_000 },
  ])
  bookEntry('2025-06-30', [
    { account: '8410', debit: 1_000_000, credit: 0 },
    { account: '1930', debit: 0, credit: 1_000_000 },
  ])
  bookEntry('2025-12-31', [
    { account: '8910', debit: 2_000_000, credit: 0 },
    { account: '2510', debit: 0, credit: 2_000_000 },
  ])

  const rr = getIncomeStatement(db, fyId)
  const br = getBalanceSheet(db, fyId)
  expect(br.equityAndLiabilities.calculatedNetResult).toBe(rr.netResult)
})
```

**Mål:** 3 tester (positivt resultat, negativt resultat, noll-resultat).

### 7.4 Negativa kontrakt

- fiscalYearId finns inte → 0, inte krasch (befintlig getAccountBalances
  returnerar tom array)
- Inga verifikationer → 0 + komplett struktur (redan testat i test 1)
- Klass-8-konton finns men 89xx saknas → 0 skatt-komponent

**Mål:** 2–3 negativa kontrakt-tester.

### 7.5 Alla service-konsumenter ger identisk årets-resultat

Testet verifierar alla fem konsument-vägar och asserterar att de ger
identisk siffra. Inkluderar re-export-vägen (opening-balance → fiscal-service)
eftersom en framtida refaktor som bryter re-exporten kan göra att
stale-check i tysthet räknar annorlunda.

```ts
it('alla 5 konsumenter av result-service ger identisk netResult', () => {
  // Seed: revenue 200k + financial expense 10k + tax 20k
  bookEntry('2025-03-01', [
    { account: '1930', debit: 20_000_000, credit: 0 },
    { account: '3002', debit: 0, credit: 20_000_000 },
  ])
  bookEntry('2025-06-30', [
    { account: '8410', debit: 1_000_000, credit: 0 },
    { account: '1930', debit: 0, credit: 1_000_000 },
  ])
  bookEntry('2025-12-31', [
    { account: '8910', debit: 2_000_000, credit: 0 },
    { account: '2510', debit: 0, credit: 2_000_000 },
  ])

  // 1. result-service direkt
  const summary = calculateResultSummary(db, fyId)

  // 2. re-export-vägen (opening-balance-service → fiscal-service)
  const viaReExport = calculateNetResult(db, fyId) // same function, re-exported

  // 3. getIncomeStatement (RR bottom-line)
  const rr = getIncomeStatement(db, fyId)

  // 4. getBalanceSheet (BR "årets resultat" — post-fix)
  const br = getBalanceSheet(db, fyId)

  // 5. IPC-handler-vägen (simulate get-net-result call)
  //    Testas indirekt via calculateNetResult som IPC-handlern anropar

  const consumers = new Map<string, number>([
    ['result-service.netResultOre', summary.netResultOre],
    ['opening-balance-reexport.calculateNetResult', viaReExport],
    ['getIncomeStatement.netResult', rr.netResult],
    ['getBalanceSheet.calculatedNetResult', br.equityAndLiabilities.calculatedNetResult],
  ])

  const distinctValues = new Set(consumers.values())
  expect(distinctValues.size).toBe(1)
  // Explicit value check as safety net
  expect(summary.netResultOre).toBe(17_000_000) // 20M - 1M financial - 2M tax
})
```

**Mål:** 1 test. Map med 4 namngivna konsumenter, 1 distinkt siffra.
IPC-handler testar samma funktion (calculateNetResult) och behöver inte
separat entry. Stänger F19-frågan permanent.

### 7.6 Sorteringsordning-test för F4-fix

```ts
it('ORDER BY account_number sorterar numeriskt efter fix', () => {
  ensureAccountExists('30000', 'Underkonto test')
  bookEntry('2025-03-15', [
    { account: '30000', debit: 100_000, credit: 0 },
    { account: '3002', debit: 0, credit: 100_000 },
  ])

  const balances = getAccountBalances(db, fyId)
  const accountNumbers = balances.map(b => b.account_number)
  // Numerisk ordning: 3002 < 30000
  const idx3002 = accountNumbers.indexOf('3002')
  const idx30000 = accountNumbers.indexOf('30000')
  expect(idx3002).toBeLessThan(idx30000)
})
```

**Mål:** 2 tester (getAccountBalances + listAccounts).

### 7.7 E2E-test för resultat-konsistens

Playwright E2E per M115. Seed via IPC. Appen använder hash-router
(M88–M91 custom hash-router, bekräftat via `window.location.hash`-navigering
i befintliga E2E-tester).

```ts
test('årets resultat identisk i RR och BR', async () => {
  // Seed company + FY + journal entries via IPC
  // Navigate to #/reports
  // Read data-raw-ore from IncomeStatementView [data-testid="arets-resultat-value"]
  // Navigate to balance sheet tab
  // Read data-raw-ore from BalanceSheetView [data-testid="arets-resultat-br-value"]
  // Assert equal
})
```

**Mål:** 1 E2E-test (RR vs BR konsistens).

### 7.8 Total budget

| Kategori | Antal |
|---|---|
| Unit comparator (7.1) | 5 |
| Property comparator (7.2) | 4 |
| BR/RR-konsistens (7.3) | 3 |
| Negativa kontrakt (7.4) | 3 |
| All-consumers-identical (7.5) | 1 |
| Sorteringsordning F4 (7.6) | 2 |
| E2E (7.7) | 1 |
| **Total** | **19** |

Baseline 1493 → ~1512.

Notering: den ursprungliga test-budgeten antog att result-service inte
existerade och att 17–22 service-tester behövdes. Eftersom result-service
redan har 14 dedikerade tester (session-43) är det orimligt att
duplicera dem. Nya tester fokuserar på BR-konsistens och F4-sortering
som saknar coverage.
