# ADR 001 — SQLite-backend: `better-sqlite3` bevaras, `node:sqlite` avvaktas

**Status:** Accepterad
**Datum:** 2026-04-17 (Sprint B)
**Kontext:** Ifrågasatt under Sprint B när ABI-friktion mellan vitest (Node-ABI)
och Playwright (Electron-ABI) orsakade återkommande rebuild-ritualer.

## Kontext

Systemet använder [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
som SQLite-binding. Det är en native Node-modul som måste byggas om för
Electron-ABI vid E2E-tester och tillbaka till Node-ABI för vitest. Node 22.5+
inkluderar `node:sqlite` som inbyggd modul — helt utan native-rebuild.

Frågan: **Ska vi migrera till `node:sqlite` för att eliminera ABI-friktionen?**

## Beslut

**Nej — vi stannar på `better-sqlite3`.** Skälen är kumulativa:

### 1. `db.transaction(fn)` är kärnan i vår transaktionsmodell

Vi har **41 `db.transaction()`-anrop** över services.
`better-sqlite3` tillhandahåller ett callback-baserat wrapper-API med
automatiska nestade savepoints — exakt det som M112/M113 bulk-
betalnings-mönstret förlitar sig på:

```ts
// Dagens kod (invoice-service.ts, expense-service.ts m.fl.)
return db.transaction(() => {
  // yttre transaction
  return db.transaction(() => {
    // inre savepoint — om den kastar rullas bara savepointen tillbaka,
    // yttre transaction kan fortsätta
  })()
})()
```

`node:sqlite` saknar detta wrapper-API. Savepoints måste hanteras manuellt
via `SAVEPOINT sp_N` / `RELEASE sp_N` / `ROLLBACK TO sp_N` med unika namn
per nestningsdjup. Det är **reimplementerbart** men varje callsite måste
auditeras och felhantering måste replikera `better-sqlite3`:s exakta
rollback-semantik vid exception.

**Riskbedömning:** Savepoint-layer hanterar finansiell data. En silent-fel
i rollback-semantiken = bokföringskorruption utan trigger-nivå-skydd.
Tester fångar det mesta men garanterar inte alla edge-cases.

### 2. `db.pragma()` används 21 gånger med typ-specifika idiom

```ts
db.pragma('journal_mode = WAL')
db.pragma('user_version', { simple: true }) as number   // scalar-extraction
db.pragma('foreign_key_check') as unknown[]             // array-resultat
```

`node:sqlite` exponerar inte `pragma()`. Måste ersättas med
`db.exec('PRAGMA ...')` (skrivning) eller `db.prepare('PRAGMA ...').get()`
(läsning) med manuell scalar-extraction. 21 anrop × handlade på rätt sätt
per kontext = audit-arbete, inte mekanisk ersättning.

Specifikt: M122 table-recreate-mönstret sätter `PRAGMA foreign_keys = OFF`
**utanför** transaktionen. `better-sqlite3`:s pragma-API har dokumenterat
beteende här. `node:sqlite`:s motsvarighet är inte testat mot samma
invariant i vår kodbas.

### 3. Backup-service behöver full omskrivning

`better-sqlite3` har `.backup(destination)` som streamar en online-backup.
`node:sqlite` saknar detta. Alternativ: `VACUUM INTO 'path.db'` — funktionellt
men inte identiskt (blockerande, ej online, annan låsnings-semantik).

[backup-service.ts](../../src/main/services/backup-service.ts) har ~200 rader
som måste revideras och regressions-testas mot samma scenarier (migration-
aware backup-restore, integrity_check, etc.).

### 4. `node:sqlite` är experimental (Node 22.22.2)

Importen emitterar `ExperimentalWarning` även i senaste LTS. API kan
ändras. Vi använder stabil binding, inte bleeding-edge API.

### 5. ROI är starkt negativ

| Post | Uppskattning |
|---|---|
| Reimplementering `db.transaction()`-wrapper | ~50 rader + audit per callsite |
| `db.pragma()`-shim | ~30 rader + verifiering per pragma |
| Error-kod-mapping (M124) | ~10 rader |
| 43 filer: `import Database from 'better-sqlite3'` → `import { DatabaseSync } from 'node:sqlite'` | Mekaniskt |
| Backup-service omskrivning | ~100 rader + regression |
| Migrations.ts PRAGMA-beteende-audit | 30+ anrop × re-verifiering |
| **Arbete** | **3–5 dagar fokuserat + 1–2 dagar regression** |

Besparing — **range-beräkning** (tidigare ADR-iteration gav punkt-estimat 50s/mån,
för snäv):

| Friction-modell | Frekvens | Per incident | Per månad |
|---|---|---|---|
| Optimistisk: känd user, 1-klick rebuild | 4–8 växlingar | 5 s | 20–40 s |
| Realistisk: inkluderar kontext-avbrott | 4–8 växlingar | 1–3 min | 4–24 min |
| Onboarding: ny utvecklare första gången | 1 × per onboard | 30–60 min | amortiseras |

Realistisk payback för migration (3–5 dagar work): **~80–450 år** beroende på
friction-modell. Beslutet ändras inte av range-osäkerheten — alla modeller
ger grovt tre-siffriga payback-år.

Och ovanstående räknar inte in subtila finansiella regression-risker.

## Konsekvenser

### Accepterade kostnader

- **ABI-friktion lokalt:** ~5–15s rebuild när man växlar mellan vitest och
  E2E. Mitigerad via `scripts/run-e2e.mjs` som återställer Node-ABI för
  npm-scriptade körningar (`npm run test:e2e*`). **Obs:** invarianten är
  scope-begränsad — direkt `npx playwright test` utan wrappern bypassar
  cleanup. Se CONTRIBUTING.md-sektionen om E2E-körning.
- **Native-modul i deps:** `better-sqlite3` måste byggas per plattform
  vid release. Hanteras av electron-builder i nuvarande setup.
- **Experimental API undviks:** vi får inte Node:sqlite-feature-utveckling
  "gratis" när den stabiliseras.

### Bevarade fördelar

- **`db.transaction()`-wrapper med nestade savepoints** — kritiskt för
  M112–M114 bulk-betalnings-atomicitet.
- **`.pragma()` med typade optioner** — bekvämt för user_version/WAL-setup.
- **`.backup()` online-API** — används av backup-service för manuella
  användarbackuper utan DB-paus.
- **Stabilt API** sedan 2016, aktiv underhåll, förutsägbar
  exception-semantik.

## Trigger-villkor för omvärdering

ADR:n ska läsas om och potentiellt reviseras om **något** av följande inträffar.
Varje trigger ska vara mekaniskt verifierbar utan subjektiv bedömning.

1. **`node:sqlite` stabiliseras** — verifiera via:
   `node -e "require('node:sqlite')"` returnerar UTAN `ExperimentalWarning`
   på aktuell Node LTS, **OCH** API-dokumentationen listar minst ett av:
   `db.transaction(fn)`-helper med nestade savepoints, eller callback-
   baserat savepoint-API (e.g. `db.savepoint(name, fn)`).
2. **better-sqlite3 development avtar** — verifiera via:
   `npm view better-sqlite3 time --json` — senaste release > 365 dagar
   gammal, **OCH** senaste Electron-major-version saknas i
   [prebuilt-matrisen](https://github.com/WiseLibs/better-sqlite3/releases).
3. **Electron ändrar native-module-policy** — verifiera via:
   `electron-rebuild` exit-code ≠ 0 på senaste Electron-version, **OCH**
   upstream-issue markerad som policy-change i Electron-projektet
   (sök electron/electron GitHub issues: `label:policy native-modules`).
4. **Prestandaregression** — verifiera via:
   benchmark av `invoice:list` eller `dashboard:summary` visar > 10%
   slöare tid än baseline registrerad i `benchmarks/`-mappen (ännu ej
   upprättad; del av trigger är att *skapa* baseline när frågan uppkommer).
5. **Transaction-layer ska refaktoreras av oberoende skäl** — verifiera via:
   sprint-plan i STATUS.md listar transaction-service-refaktor som
   huvudleverabel (inte som biverkan). Då, och bara då, kan migration
   åkas med till minimal marginalkostnad.

**Nuvarande status (april 2026):**
- Trigger 1: `ExperimentalWarning` emitteras fortfarande (verifierat 2026-04-17)
- Trigger 2: better-sqlite3 v12.x aktiv, senaste release inom 365 d
- Trigger 3: electron-rebuild fungerar mot senaste Electron
- Trigger 4: ingen baseline registrerad, ingen regression rapporterad
- Trigger 5: ingen planerad transaction-layer-refaktor

**Ingen trigger aktiv.**

## Migration-surface (om ADR:n ever revideras)

Om beslutet någon gång ska omprövas: nedan är inventariet som behöver
auditeras, per Sprint B-analysen.

**Filer att röra:** 43 TypeScript-filer i `src/main/` importerar
`better-sqlite3` direkt.

**API-ytor som kräver omskrivning eller shim:**

| API | Callsites | Omskrivningsstrategi |
|---|---|---|
| `db.transaction(fn)` | 41 | Wrapper-helper med manual SAVEPOINT-naming per depth |
| `db.pragma(key, opts?)` | 21 | Shim: wrap `db.exec`/`db.prepare` + extract scalar |
| `db.backup(dest)` | 1 (backup-service) | Ersätt med `VACUUM INTO` + test mot M122-scenarier |
| `SqliteError.code` (M124) | 4 | Mappa till `node:sqlite`:s error-egenskap |
| `PRAGMA foreign_keys = OFF` utanför tx (M122) | 3 migrations | Re-testa att node:sqlite respekterar samma semantik |
| `lastInsertRowid` | ~30 | node:sqlite returnerar `lastInsertRowid` som BigInt — casting-audit |
| `safeIntegers`-läge | 0 (vi använder default) | N/A |
| `db.function()` custom functions | 0 | N/A |

**Testkapacitet:** 2437 vitest + 58 Playwright-specs täcker en stor del av
beteendet. System-lagret äger savepoint/rollback-invariantest. En
migration måste passera hela suiten oförändrat, **plus** nya explicita
savepoint-nesting-tester som dagens kod inte har för att tigga
`better-sqlite3`-specifika-beteenden.

**Stegordning om migration görs:**

1. Introducera abstraktions-shim (`src/main/db-backend.ts`) som exponerar
   den subset av API vi använder. Båda bindings implementerar den.
2. Byt callsites till shim en service i taget.
3. När alla services använder shim — byt backend från better-sqlite3 till
   node:sqlite i shim-implementationen. Enskild-fil-ändring.
4. Rulla tillbaka via shim-implementationen om regression upptäcks.

**⚠️ Migration-path är ej empiriskt validerad.** Ingen PoC-spike har
genomförts mot `node:sqlite` i detta projekt. Specifikt otestade antaganden:

- Att shim-mönstret täcker ALLA nyttjade `better-sqlite3`-features med
  beteende-paritet (savepoint-namn-collision, BigInt-handling i
  `lastInsertRowid`, error-property-namn).
- Att `VACUUM INTO` ger samma integrity-garantier som `.backup()`-API:et
  för våra backup-restore-scenarier.
- Att `PRAGMA foreign_keys = OFF` utanför transaktion (M122) beter sig
  identiskt i node:sqlite.

**Innan migration påbörjas:** avsätt 0.5–1 dag för PoC-spike som
verifierar dessa antaganden mot minst en service (förslag:
`counterparty-service` — enkel CRUD + UNIQUE-constraints räcker för
att exponera de mesta friktionspunkterna). Om PoC:n exponerar oväntade
beteende-diffar — revidera stegordningen innan full migration.

## Referenser

- M112/M113 (nested savepoints för bulk-betalningar)
- M121/M122 (table-recreate med PRAGMA foreign_keys)
- M124 (SQLITE_CONSTRAINT_UNIQUE-mapping)
- `scripts/run-e2e.mjs` (Sprint B — hanterar ABI-invariantem vi valde att bära)
