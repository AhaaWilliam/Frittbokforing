# OpenHands Setup – Fritt Bokföring
*Helt autonom agent som kodar, testar och itererar på din Electron-app*

---

## Förutsättningar

- Docker Desktop installerat och igång
- Anthropic API-nyckel (samma som du använder för Claude Code)
- Din Fritt Bokföring-repo klonad lokalt
- Node 18+ installerat i repo-mappen

---

## Steg 1 – Starta OpenHands med Docker

Kör detta från terminalen (byt ut sökvägen till din faktiska repo):

```bash
docker run -it --rm \
  --name openhands-fritt \
  -e LLM_API_KEY="sk-ant-DINNYCKEL" \
  -e LLM_MODEL="anthropic/claude-sonnet-4-6" \
  -e LLM_PROVIDER="anthropic" \
  -v /Users/DITTNAMN/Projects/fritt-bokforing:/workspace \
  -v openhands-node-modules:/workspace/node_modules \
  -p 3000:3000 \
  docker.openhands.dev/all-hands-ai/openhands:latest
```

Öppna sedan **http://localhost:3000** i webbläsaren.

> **Varför `-v openhands-node-modules:/workspace/node_modules`?**
> Du kör macOS lokalt men OpenHands kör Linux i Docker. `better-sqlite3` kompileras mot operativsystemet – utan denna isolerade volym kraschar `npm test` direkt med ett ABI-fel eftersom containern försöker använda din macOS-kompilerade binär. Docker-volymen ger containern ett eget `node_modules` och kör `npm install` för Linux automatiskt vid första start.

> **Tips:** Lägg kommandot i ett skript `start-agent.sh` i repo-roten så du bara kör `./start-agent.sh`.

---

## Steg 2 – Konfigurera modellen i GUI

1. Klicka på kugghjulet (Settings) i OpenHands UI
2. Sätt:
   - **Provider:** Anthropic
   - **Model:** `claude-sonnet-4-6`
   - **API Key:** din nyckel
3. Spara

---

## Steg 3 – System Prompt (KRITISKT)

Klistra in detta som **Custom System Instructions** i Settings.
Det är din `CLAUDE.md` komprimerad till agent-instruktioner:

```
Du är en senior TypeScript/Electron-utvecklare som jobbar på Fritt Bokföring,
en gratis svensk bokföringsapp för aktiebolag (K2/K3).

## STACK
- Electron + React + TypeScript (strict mode, inga `any`, inga implicit undefined)
- SQLite via better-sqlite3 (ABI-känslig, native module)
- Zod för validering, TanStack Query, Vitest, Playwright
- ~75 IPC-kanaler med typed IpcResult discriminated unions
- Electron-säkerhet: contextIsolation: true, nodeIntegration: false, sandbox: true
  Renderer har ALDRIG access till Node.js. All IPC via preload.ts + contextBridge.

## KÄRNPRINCIPER (icke-förhandlingsbara)

### Bokföringsintegritet
- ALL bokföringslogik i main process, aldrig i renderer. Renderer visar data, main gör beräkningar.
- `journal_entries` är systemets kärna. Fakturor, kostnader och betalningar GENERERAR verifikationer.
  Duplicera ALDRIG bokföringslogik utanför journal-byggaren.
- APPEND-ONLY: bokförda verifikationer får aldrig ändras eller raderas. Korrigering sker via
  nya verifikationer (C-serien). Enforced i både SQLite-triggers och TypeScript.
- Main process är source of truth för moms. Beräknas per fakturarad (belopp × momssats, heltal ören),
  sedan summeras. Renderer visar bara preview.

### Data & belopp
- Alla belopp lagras som heltal i ören (INTEGER). Aldrig floating point för pengar.
- Alla belopp-INTEGER-kolumner i SQLite MÅSTE ha `_ore`-suffix (M119).
- Renderer form-types använder `_kr`-suffix; konvertering till öre sker i form-transformer vid submit.
  `_kr`-data får ALDRIG korsa IPC-gränsen (M136).
- Monetär multiplikation med fraktionella operander går via `multiplyKrToOre` i `src/shared/money.ts` (M131).

### IPC & validering
- Alla IPC-handlers använder antingen (1) direkt delegation till service som returnerar IpcResult,
  eller (2) `wrapIpcHandler(schema, fn)` från `src/main/ipc/wrap-ipc-handler.ts` (M128).
- Zod-schemas i `.strict()`-läge för alla IPC-payloads. Schemas i `ipc-schemas.ts`, delade typer i `shared/types.ts`.
- IPC-svar alltid `{ success: true, data } | { success: false, error }` (IpcResult).
- Strukturerade fel kastas som `{ code: ErrorCode, error: string, field?: string }`, aldrig plain `Error` i services (M100).
- Affärsdata-kanaler MÅSTE använda `useIpcQuery<T>` i renderer (M144). `useDirectQuery` endast för infrastruktur.

### Tid, migrationer & transaktioner
- Tid: använd `getNow()` eller `todayLocalFromNow()` från `src/main/utils/now.ts`, aldrig `new Date()` direkt i services (M150).
- Migrationer skrivs i `src/main/migrations.ts` (en fil), numreras sekventiellt, kör i BEGIN EXCLUSIVE.
  PRAGMA user_version inkrementeras i slutet av varje migration.
- Alla DB-operationer körs i transaktioner (`db.transaction(...)`). better-sqlite3 tillåter INTE nested transactions.

### Scoping
- Alla transaktionsdata-queries (fakturor, kostnader, journal_entries, moms) tar `fiscal_year_id` som parameter.
  Anta ALDRIG "aktuellt år" (regel 14).
- Stamdata (counterparties, products, price_lists) scopas per `company_id`, inte fiscal_year (M158).
- K2/K3-filtrering sker vid runtime via `companies.fiscal_rule`, aldrig via markering på accounts.

### Delade konstanter
- Validerings-gränser som gäller i både form- och IPC-lager läggs i `src/shared/constants.ts` (M132).

## ARBETSFLÖDE

1. **Läs först.** Börja ALLTID med att läsa `CLAUDE.md` i workspace-roten för fullständiga M-principer.
2. **Matcha befintligt mönster.** Innan du skriver ny kod: läs minst 2 liknande befintliga filer och följ samma struktur,
   namngivning och felhantering. Gissa aldrig på konventioner — verifiera mot faktisk kod.
3. **TDD-liknande loop.** Skriv/ändra kod → kör `npm run test:agent` → läs fel → fixa → kör igen.
4. **Commit per deluppgift.** Efter varje klar + testad deluppgift: `git add` + `git commit -m "feat: ..."`
   eller `fix: ...` INNAN du går vidare. Gör aldrig en monolitisk commit i slutet.
5. **Stopp-villkor.** Om samma fel kvarstår efter 3 försök: stoppa, beskriv vad du fastnade på och vilka hypoteser du testat.
6. **Klart-kriterium.** Alla tester gröna + alla commits gjorda + en kort sammanfattning av vad som ändrats.

## TESTKRAV
- Kör ALLTID `npm run test:agent` (Vitest) efter varje meningsfull förändring.
- Kör ALDRIG `npx playwright test` — E2E kräver display och fungerar inte i Docker. E2E verifieras manuellt efteråt.
- Lägg till tester för ny funktionalitet. Antal tester ska minst vara samma som före din förändring.
- Om du behöver mocka tid: använd `FRITT_NOW` env-variabel, inte monkeypatching av Date.

## FÖRBJUDET
- `new Date()` i services utan argument → använd `getNow()`.
- Plain `throw new Error(...)` i services → använd strukturerade fel.
- Lexikografiska kontojämförelser (`account_number >= '3000'`, `LIKE '1%'`) → bryter för 5-siffriga underkonton (M98).
- `UPDATE` eller `DELETE` på bokförda `journal_entries` → blockeras av triggers, men använd aldrig mönstret.
- `axeCheck: false` i testfiler utan `// M133 exempt`-kommentar (M133).
- Direkt `better-sqlite3`-access i E2E-tester → seeda via IPC (M148).
```

---

## Steg 4 – Ge agenten en task

Börja med något **avgränsat och verifierbart**. Exempel på bra första tasks:

### Enkel (bra att börja med)
```
Läs igenom CLAUDE.md och src/main/ipc/ för att förstå IPC-mönstret.
Skapa sedan en ny IPC-kanal `budget:getTargetsByYear` som returnerar
alla budget_targets för ett givet fiscal_year_id.
Följ exakt samma mönster som befintliga kanaler.
Kör npm run test:agent och se till att alla tester är gröna.
```

### Medel
```
Läs budget_targets-tabellen och BudgetService.
Implementera en `budget:copyFromPreviousYear`-funktion som kopierar
alla targets från ett räkenskapsår till ett nytt.
Inkludera enhetstester. Alla befintliga tester ska fortsätta vara gröna.
```

### Avancerad
```
Läs F4-fyndet i schema audit-dokumentationen.
Implementera namngivningskonventionen för alla berörda IPC-schemas
enligt M-principerna. Skapa migration om nödvändigt.
Kör hela testsviten och fixa eventuella fel.
```

---

## Steg 5 – Notion-poller (automatisk task-inmatning)

Se `scripts/notion-poller.mjs` i repo-roten.

Installera dependency och kör:
```bash
npm install @notionhq/client
NOTION_TOKEN=secret_xxx NOTION_DB_ID=xxx node scripts/notion-poller.mjs
```

---

## Steg 6 – E2E-begränsning (viktigt för Electron)

OpenHands kör i Docker och kan **inte** starta Electron-fönstret för Playwright E2E.
Lägg till detta i din task-beskrivning när det är relevant:

```
OBS: Playwright E2E-tester kräver en display och kan inte köras i denna miljö.
Kör INTE `npx playwright test`. Kör bara `npm run test:agent` (Vitest).
E2E-tester verifieras manuellt av William efteråt.
```

---

## Rekommenderat workflow

```
Du (Notion) → "Redo för agent"
      ↓
Notion-poller (automatisk)
      ↓
OpenHands agent startar task
      ↓
Kod → Vitest → Fixa → Vitest → Grönt
      ↓
Agent rapporterar klart
      ↓
Du reviewar diff i git → merger om OK
      ↓
Uppdatera Notion manuellt (eller bygg webhook)
```

---

## Kostnadsuppskattning

| Task-typ | Ungefärlig kostnad |
|---|---|
| Enkel IPC-kanal + tester | ~$0.10–0.30 |
| Ny service med full testsvit | ~$0.50–1.00 |
| Schema-migration + refaktorering | ~$1–3 |
| Sprint med 3–5 tasks | ~$3–8 |

*Baserat på Claude Sonnet 4.6-priser, april 2026*

---

## Felsökning

**Docker-image hittas inte:**
```bash
docker pull docker.openhands.dev/all-hands-ai/openhands:latest
# eller lägg till --dns 8.8.8.8 till docker run
```

**ABI-fel efter körning:**
```bash
cd /workspace && npm run rebuild
# eller: npx electron-rebuild -f -w better-sqlite3
```

**Agenten loopar på ett fel:**
Ge den ett stopp-villkor i tasken: *"Om du inte löser felet efter 3 försök, stoppa och beskriv vad du fastnade på."*

**Tester failar p.g.a. missing env:**
Lägg till i docker run:
```bash
-e FRITT_DB_PATH=/tmp/test.db
```

---

## Nästa steg

1. ✅ Kör `./start-agent.sh`
2. ✅ Klistra in system prompt (Steg 3)
3. ✅ Ge en avgränsad första task
4. 👀 Reviewta diff i git
5. 🔁 Skala upp med Notion-pollern
