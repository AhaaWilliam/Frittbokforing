# Testing Total — findings log

Bugs, gaps och out-of-scope-observationer upptäckta under testbygget.
Vid hit: skriv `.skip`:ad test som failar, flagga här, gå vidare.
Fix = separat sprint.

## Phase 1 — mutation gaps

### F-TT-001: parseDecimal — trim+empty-check är dead code ✅ FIXED

**Fix:** Dead code borttagen från `src/shared/money.ts`. `parseDecimal` är nu
en enrads `return parseFloat(value.replace(',', '.'))`. Alla existerande
beteenden bevaras (parseFloat hanterar whitespace + tom sträng → NaN naturligt).
Stryker-score på money.ts: 82.35% → **100%** (12/12 mutanter dödade).

---

### F-TT-001 (historisk): parseDecimal — trim+empty-check är dead code

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

### F-TT-002: Stryker sandbox + better-sqlite3 SIGSEGV ❌ UNRESOLVED

**TT-1-utredning (2026-04-19):**

Försökte Alt A (vitest `pool:'threads'` + `fileParallelism:false`) och
inPlace-läge. Båda failar med samma SIGSEGV.

**Rotorsak identifierad:** `@stryker-mutator/vitest-runner` 9.6.1 har
hårdkodat `pool: 'threads'` i `vitest-test-runner.js:40` som inte kan
override:as via konfig. Kombinerat med Vitest 4.1 och `better-sqlite3` (som
inte är thread-safe via `worker_threads`) → SIGSEGV när någon service-test
öppnar en DB-handle i en worker-thread.

**Vitest 4 deprecerar gamla `poolOptions`-strukturen** — stryker-runnerns
injicerade config använder fortfarande gammalt format ("DEPRECATED:
test.poolOptions was removed in Vitest 4" i loggarna). Upstream-problem.

**Framtida lösningar (ej levererade i TT-1):**

1. **Alt A-fix:** vänta på ny stryker-runner-release som stöder
   `pool: 'forks'` eller annan konfig. Bevakar
   [stryker-mutator/stryker-js#4853](https://github.com/stryker-mutator/stryker-js).
2. **Alt B (preload):** bygga en `stryker-preload.cjs` som monkey-patchar
   `@stryker-mutator/vitest-runner`s injicerade config innan vitest-start.
   Skissat men ej implementerat.
3. **Alt C (mock):** skapa `tests/mocks/better-sqlite3-inmemory.ts` som
   implementerar subset av bss3-API:t. Vite-alias i stryker-config.
   Uppskattat 4–8 h. Inte implementerat pga begränsad TT-1-tidsbudget.
4. **Nedgradera vitest:** till 3.x tillfälligt. Impacterar hela sviten,
   ej acceptabelt.

**Status:** Alt D (scope-accept) vald. Stryker-config låst till
`src/shared/money.ts` (100% mutation score). Service-mutation-coverage
levereras via fas 2 (property), fas 3 (invariant), fas 4 (state-machine)
som skyddar motsvarande logik genom andra mekanismer.

Om upstream-fix landas → uppdatera stryker-runner och utvidga `mutate`-lista.

---

### F-TT-002 (historisk): Stryker sandbox + better-sqlite3 SIGSEGV ⚠️ PARTIAL FIX

**Försök:** Lade till `buildCommand: "npm rebuild better-sqlite3 better-sqlite3-multiple-ciphers"`
i `stryker.conf.json`. Detta kör rebuild i varje sandbox efter kopiering.
**Resultat:** Rebuild körs men vitest-worker-processerna kraschar fortfarande
med SIGSEGV (både invoice-service och result-service). Djupare problem än
bara ABI — troligen att vitest `pool: 'forks'` spawnar child-processer som
inte ser den rebuildade modulen. Scope kvar på `src/shared/money.ts`.

Möjliga framtida lösningar:
1. `vitest.config.ts` med `pool: 'threads'` och `poolOptions.threads.singleThread: true`
   i Stryker-läge — undviker fork-problemet
2. Mock better-sqlite3 till better-sqlite3-wasm eller in-memory-mock
3. Stryker-config med `testRunnerNodeArgs` som pekar på rebuildad modul

---

### F-TT-002 (historisk): Stryker sandbox + better-sqlite3 SIGSEGV

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

### F-TT-003: expenses saknar `>= 0` CHECK på belopps-kolumner ✅ FIXED

**Fix:** Migration 047 (index 46) i `src/main/migrations.ts` table-recreate:ar
expenses med `CHECK (total_amount_ore >= 0)` + `CHECK (paid_amount_ore >= 0)`
enligt M122-mönstret. M141 cross-table trigger-hantering:
`trg_no_correct_with_payments` (attached till journal_entries men refererar
expenses i body) droppas före DROP/RENAME och återskapas efter. Alla indexes
och triggers på expenses återskapas. Migration lägger user_version från
46 → 47. FK_OFF_MIGRATION_INDEXES uppdaterad i både `src/main/db.ts` och
`tests/helpers/create-test-db.ts`. 21 test-filer uppdaterade för
user_version-assertions (46 → 47).

M137-scanner-testet `tests/invariants/scanners/M137-positive-amounts.test.ts`
är nu unskipped och grönt.

---

### F-TT-003 (historisk): expenses saknar `>= 0` CHECK på belopps-kolumner (M137-gap)

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

### F-TT-004: User-enumeration via login-timing ✅ FIXED

**Problem:** `auth-service.login()` kollade `vault.findUser(userId)` först och
returnerade USER_NOT_FOUND early om användaren inte fanns — utan att köra
argon2id-decrypt. Existerande användare med fel lösen triggade full argon2id-
pipeline (~1ms per försök med FAST_KDF, ~200–500ms i prod).

Mätt timing-ratio före fix: **0.030** (USER_NOT_FOUND 33× snabbare).
Attackyta: angripare kan enumerera giltiga user-IDs via response-tid utan
något lösen.

**Fix:** `createAuthService` skapar lazy en cached `dummyEnvelope` med samma
`kdf`-params som riktiga user-envelopes. Vid USER_NOT_FOUND kör login nu
`openEnvelope(dummy, pwBuf)` innan den kastar USER_NOT_FOUND. argon2id-
kostnaden matchar riktiga login-flödet.

Mätt timing-ratio efter fix: **0.983** (praktiskt constant-time).

**Test:** `tests/security-fuzz/auth-timing.test.ts` I2 gate:ar ratio ≥ 0.5
(marginal för JIT + OS-scheduling). Regression-skyddat.

**Referens:** Sprint TT-7 (2026-04-19).
