## 4. Föreslagen taktik

### 4.0 Omformulering av sprint-scope

Forskningen visar att F19/F4-paketet är **väsentligt mindre** än antaget:

- **F19:** result-service finns redan (M96). Kvarvarande arbete: refaktorera
  BR:s oberoende netResult-beräkning (~5 rader) + konsolidera med test.
- **F4:** 6 latenta presentationssorteringsfel. Inga klass-A (beräkningsfel).
  Konto-skapande begränsat till 4 siffror via Zod-schema.

S24b blir en **konsoliderings-sprint**, inte en arkitektur-sprint.

### 4.1 Result-service — befintlig arkitektur behålls

**Inget nytt API behövs.** Befintlig `calculateResultSummary` och
`calculateNetResult` täcker alla behov:

- Dashboard: `calculateResultBreakdown` (redan korrekt)
- Tax: `calculateOperatingResult` (redan korrekt)
- RR: `calculateResultSummary` (redan korrekt)
- **BR: `calculateNetResult` (ny konsument — ersätter oberoende filter-reduce)**

**Designbeslut (spikade):**

| Fråga | Beslut | Motivering |
|---|---|---|
| Konto-klass 8 i "årets resultat"? | Ja — hela 3000–8999 | K2 kap 4: sista raden inkluderar allt t.o.m. skatt |
| Skatt ingår i "årets resultat"? | Ja — post inom 8900–8999 | K2: "Skatt på årets resultat" är en rad *före* "Årets resultat"-summan |
| Status-filter default? | booked only | Redan implementerat i `getAccountBalances` |
| O-serie separering? | Via status (draft opening_balance undantas) | Redan implementerat |
| Transaction isolation? | Ja — `getBalanceSheet` kör redan i implicit read-transaction via WAL. `calculateNetResult` anropas inifrån samma connection. | SQLite WAL: snapshot-isolation per connection |

**Observability:** Befintlig `ResultBreakdown`-typ returnerar redan
`revenueOre`, `expensesOre`, `operatingResultOre`. Att utöka med
per-bucket-kontoinfo (top_accounts) bedöms som overengineering för pre-launch.
Kan läggas till om support-ärenden kräver det post-launch.

**UI-kontrakt:** Följande `data-testid` + `data-raw-ore` läggs till:

| Vy | Element | data-testid | data-raw-ore |
|---|---|---|---|
| IncomeStatementView | "Årets resultat"-raden | `arets-resultat-value` | `netResult` som sträng |
| BalanceSheetView | "Årets resultat"-raden | `arets-resultat-br-value` | `calculatedNetResult` som sträng |

Dashboard och Tax visar inte "Årets resultat" — de visar EBIT, korrekt.
Inget data-testid för "årets resultat" behövs där.

### 4.2 account_number-comparator + F4-strategi

**Helper-plats:** `src/shared/account-number.ts` (isomorphic, ingen Node-API).

**API:**

```ts
export function compareAccountNumbers(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}
```

Edge cases: validering att input är numerisk sker redan i Zod-scheman
(account_number-fält). Helpern antar valid input. `parseInt('', 10)` → NaN,
`NaN - NaN` → NaN, `.sort()` med NaN comparator ger undefined behavior —
men detta kan aldrig hända med validerad data.

**SQL-strategi:** `CAST(account_number AS INTEGER)` i ORDER BY.

| Strategi | Vald? | Motivering |
|---|---|---|
| `CAST(… AS INTEGER)` per query | **Ja** | Alla 5 ORDER BY:er är på GROUP BY-resultat (< 100 rader). Full table scan på resultatmängden, inte på journaltabellen. Prestanda-impact: negligerbar. |
| Generated column + index | Nej | Overkill: kräver table-recreate (M122) för 95 rader med 4-siffriga konton. Ingen hot path. |
| Application-layer | Nej för SQL, **Ja** för #6 (localeCompare) | localeCompare-träffen fixas med `compareAccountNumbers` helper. |
| IN-lista | Nej | Onödigt — CAST löser det enklare. |

**Branded type `AccountNumber`:** Flaggas som S24c-finding, inte i scope.

**Schema-constraint som permanent F4-vakt:**

Nuvarande skydd mot 5-siffriga konton: Zod-schema `min(4).max(4)` i
`createAccount`. Men detta skyddar inte mot:
- Framtida SIE-import (existerar inte idag men är backlog)
- Backup-restore eller manuell SQL
- Framtida BAS-uppdatering

Rekommendation: lägg `CHECK(length(account_number) BETWEEN 4 AND 5)` på
`accounts`-tabellen som migration i S24b. BETWEEN 4 AND 5 (inte = 4) för att
inte blockera framtida 5-siffriga underkonton — istället gör det F4-fixet
redan redo för dem. Om 5-siffriga konton introduceras i framtiden behöver
enbart Zod-schemat uppdateras (max(5)), inte koden.

Alternativ: `CHECK(length(account_number) = 4)` som strikare vakt. Kräver
schema-migration om 5-siffriga underkonton införs.

Notering: `accounts`-tabellen har inkommande FK (M122-lista). Men `ADD COLUMN`
behövs inte — CHECK läggs på befintlig kolumn via table-recreate. Dock:
`accounts` har FK-referenser från 6 tabeller → kräver M122 full-mönster
(PRAGMA foreign_keys = OFF, table-recreate, FK-check).

**Beslut:** Dokumentera som M135 ("account_number längd-constraint") men
**skjut table-recreate till S24c**. F4-fixet (CAST + compareAccountNumbers) är
tillräckligt för S24b. Schema-constraint är defense-in-depth, inte blocker.

**S24c eskalerings-triggers (dokumenteras i STATUS.md under findingen):**

F4-skyddet är application-layer-only (CAST i SQL, compareAccountNumbers i TS).
S24c eskaleras till S24b-equivalent om någon av dessa inträffar:
1. **Import-väg läggs till** (SIE-import, CSV-import) — extern data kringgår
   Zod-schema och kan introducera 5-siffriga konton direkt i DB.
2. **BAS-uppdatering ger 5-siffriga konton** — BFN utfärdar ny kontoplan med
   underkonton. Kräver att Zod-schema (max(4)) ändras, men utan schema-
   constraint blockas inte direkt SQL-insert.
3. **Backup-restore kringgår validering** — om restore-logiken skriver direkt
   till DB utan att passera createAccount-endpoint. (Nuläge: ingen
   backup-restore-funktion existerar utöver pre-update-backup.ts som kopierar
   DB-filen rakt av, inte selektiv restore.)

Utan dessa triggers förblir S24c latent backlog. Med någon av dem → prioritera
schema-constraint före eller i samma sprint som triggern.

### 4.3 Migrations-väg

**Big-bang squash.** Skäl:

1. Total commit-omfång < 200 rader (inklusive tester).
2. F19-fixet är ~5 rader (byt BR:s filter-reduce mot `calculateNetResult`-anrop).
3. F4-fixet är ~6 SQL ORDER BY-ändringar + 1 localeCompare → helper.
4. Inget mellan-tillstånd existerar — BR visar antingen egen beräkning (pre-fix)
   eller result-service-beräkning (post-fix).

Feature-flag avfärdad: omotiverad komplexitet för <200 rader.
