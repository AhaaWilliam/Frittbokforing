## 6. Arkitektur-alternativ

Givet att result-service redan existerar ändras frågan från "vilken arkitektur
ska vi bygga?" till "hur ska BR konsumera result-service?". Tre alternativ:

### Alternativ A — BR anropar calculateNetResult direkt

```ts
// report-service.ts:getBalanceSheet — byt rad 137–141:
const calculatedNetResult = calculateNetResult(db, fiscalYearId, dateRange)
```

**Påverkan:** 1 rad ändrad, 3 rader borttagna. Ingen ny fil. Ingen ny
IPC-handler. Ingen ny PayloadSchema.

**Pro:** Minimalt. BR och RR garanterat konsistenta per design.
**Con:** BR anropar `calculateNetResult` som internt anropar
`getAccountBalances` en andra gång (BR anropar den redan för klass 1–2).
Dubbel-query. I praktiken: < 1ms overhead (95 kontorader, in-memory SQLite).

**Test-delta:** +2 (BR/RR-konsistens + negativ-test).

### Alternativ B — BR extraherar netResult från movements via matchesRanges

```ts
// report-service.ts:getBalanceSheet — byt rad 137–141:
import { INCOME_STATEMENT_CONFIG, matchesRanges } from './k2-mapping'

const allRanges = INCOME_STATEMENT_CONFIG.flatMap(g =>
  g.lines.flatMap(l => l.ranges)
)
const calculatedNetResult = movements
  .filter(m => matchesRanges(m.account_number, allRanges))
  .reduce((s, m) => s + m.net, 0)
```

**Påverkan:** ~5 rader ändrade. Undviker dubbel-query genom att använda
redan hämtad `movements`.

**Pro:** Effektivast (ingen extra DB-roundtrip). Använder samma
`INCOME_STATEMENT_CONFIG` som result-service.
**Con:** Duplicerar aggregationslogik — `buildGroups()` summerar per grupp,
medan detta summerar totalt. Om `INCOME_STATEMENT_CONFIG` ändras (t.ex.
signMultiplier-ändring) kan det divergera.

**Test-delta:** +2.

### Alternativ C — BR konsumerar calculateResultSummary (rekommenderad)

```ts
// report-service.ts:getBalanceSheet — byt rad 137–141:
const resultSummary = calculateResultSummary(db, fiscalYearId, dateRange)
const calculatedNetResult = resultSummary.netResultOre
```

**Påverkan:** 2 rader ändrade, 4 rader borttagna. En ny import.
Ingen ny PayloadSchema.

**Pro:**
- Konsistent med `getIncomeStatement` (rad 32) som redan anropar
  `calculateResultSummary`.
- Ger tillgång till `operatingResultOre` och `resultAfterFinancialOre`
  om BR behöver visa dem (framtidssäkert).
- Dubbel-query men identisk overhead som Alt A (~1ms).

**Con:** Hämtar mer data än nödvändigt (tre resultat-nivåer, BR behöver bara
netResult). Negligerbart.

**Test-delta:** +2.

---

**Rekommendation: Alternativ C.** Ger samma garanti som A men med rikare
returtyp. getIncomeStatement anropar redan `calculateResultSummary` —
symmetri med `getBalanceSheet` gör koden lättare att resonera om.

Alternativ B avfärdas: duplicerar aggregationslogik trots att poängen med
F19-fixet är att eliminera duplicering.
