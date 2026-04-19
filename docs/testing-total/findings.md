# Testing Total — findings log

Bugs, gaps och out-of-scope-observationer upptäckta under testbygget.
Vid hit: skriv `.skip`:ad test som failar, flagga här, gå vidare.
Fix = separat sprint.

## Phase 1 — mutation gaps

### F-TT-001: parseDecimal — trim+empty-check är dead code

**Fil:** `src/shared/money.ts:43-47`

Stryker-mutanter på L44 (`value.trim()` → `value`), L45 (`if (false)`, `"Stryker was here!"`)
överlever ens efter direkt-tester. Rotorsak: `parseFloat` hanterar whitespace
(leading+trailing) och tom sträng → `NaN` naturligt, så den explicita trim +
empty-check är funktionellt redundant.

**Konsekvens:** Ingen bug i produktion — parseDecimal uppför sig korrekt. Men
koden har en osann duplicering av ansvar. Antingen:

1. Ta bort trim+empty-check (gör produktionen simpler) — kräver verifiering att
   parseFloat-beteendet är stabilt över Node-versioner.
2. Behåll som defensiv intentionskod, markera med kommentar att den är belt-and-
   suspenders.

Rekommendation: lämna som-är tills nästa money.ts-refactor. Dokumenterat i
CLAUDE.md M131 saknar kravbeskrivning för exakt beteende vid tom sträng, så
båda implementationer är lika korrekta.

**Status:** Flaggad. Ingen test skriven (ingen produktion-bug att skydda mot).
Mutation-score på money.ts stannar på 82.35% pga dessa 3 mutanter.

### F-TT-002: Stryker sandbox + better-sqlite3 SIGSEGV

**Problem:** Stryker kopierar källkoden till `.stryker-tmp/sandbox-XXX/` och
kör vitest därifrån. För filer som beror på `better-sqlite3` (alla service-
filer som importerar `db.ts`) crashar child-processen med SIGSEGV — native
module kompileras för en specifik Node-ABI och kan inte rebuildas per sandbox.

**Testade filer som fungerar:** `src/shared/*.ts` (pure logic, inga native deps).
**Testade filer som failar:** `src/main/services/*.ts`.

**Workaround-alternativ:**
1. `hooks` i stryker.conf.json som `postSandbox` kör `npm rebuild better-sqlite3`
   i varje sandbox — tungt (4+ sandboxes, 30s per rebuild = 2 min overhead per fil)
2. Shim better-sqlite3 till ett in-memory mock för mutation-testning
3. Begränsa Stryker till shared/pure-logic och använd andra tekniker (property +
   invariant) för service-lager

**Status:** Vald strategi = alternativ 3. Stryker-config kvarstår för
`src/shared/money.ts`. Utvidgning till services är separat backlog-item.
Phase 2+ levererar motsvarande coverage via property-tester och invariant-audit.


## Phase 2 — property-based motexempel

(tbd)

## Phase 3 — invariant gaps

### F-TT-003: expenses saknar `>= 0` CHECK på belopps-kolumner (M137-gap)

**Observation:** Invoices har `CHECK (paid_amount_ore >= 0)` (migration 022
table-recreate). Expenses har bara `ALTER TABLE RENAME COLUMN paid_amount TO
paid_amount_ore` (migration 022) utan tillhörande CHECK, eftersom M127
(ADD COLUMN-begränsning) förbjuder constraint via ALTER TABLE.

**Kolumner utan CHECK i expenses-tabellen:**
- `total_amount_ore`
- `net_amount_ore` (om den finns — bekräfta)
- `vat_amount_ore` (om den finns — bekräfta)
- `paid_amount_ore`

**Risk:** En service-bug som skulle beräkna negativa belopp skulle gå
obemärkt i expenses men fångas direkt av CHECK i invoices.

**Rekommendation:** Migration som table-recreate:ar expenses för att lägga
till `>= 0`-CHECKs analogt med invoices. Kräver M122-mönstret (inkommande
FK från `expense_lines`, `expense_payments`). Låt vara tills nästa schema-
sprint.

**Status:** Scanner-test `tests/invariants/scanners/M137-positive-amounts.test.ts`
förväntar constraint och FAILAR för expenses → flaggar regression. Efter
fix i schemat kommer testet grönt. Testet lämnas som-är (röd vakt).

## Phase 4 — state-machine shrunk motexempel

(tbd)

## Phase 5 — migrations regressions

(tbd)

## Phase 6 — E2E flakiness / bugs

(tbd)

## Phase 7 — security gaps

(tbd)
