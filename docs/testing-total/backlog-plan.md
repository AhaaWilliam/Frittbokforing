# Testing Total — Backlog-plan

Efter Sprint Testing Total (2026-04-19). Uppdaterad: 2026-04-19.

**Prioriterings-axlar:** (1) ROI per timme, (2) dependency-ordning (lås-upp först),
(3) risk som minskas (bug-fångst), (4) implementations-enkelhet.

Total estimat: **~8–12 arbetsdagar** i ordningsföljden nedan. Varje sprint
är körbar isolerat; ingen sprint blockerar nästa utöver F-TT-002 som låser
upp mer mutation-coverage.

---

## Sprint TT-1 — F-TT-002 Stryker mot services (1–2 dagar)

**Varför först:** Upplåser mutation-testning på affärslogik (~60 service-filer).
Utan detta måste fas 1-expansion ske via indirekta mått.

**Approach-ordning (försök i tur):**

### Alt A — vitest `pool: 'threads'` (snabbast att testa, 1–2 h)
1. Skapa `vitest.config.stryker.ts` med `pool: 'threads'` +
   `poolOptions.threads.singleThread: true`.
2. Ändra `stryker.conf.json` → `"testRunnerArgs": "--config=vitest.config.stryker.ts"`
   (eller motsv.).
3. Kör Stryker på en liten service först (`result-service.ts`).
4. Om grönt → expandera till hela ursprungliga 11-fil-listan.

### Alt B — testRunner subprocess med `NODE_OPTIONS` för preloading (2–4 h)
1. Preload-skript som explicit rebuildar better-sqlite3 mot node-abi innan
   vitest importerar modulen.
2. `stryker.conf.json` → `"testRunnerNodeArgs": ["-r", "./stryker-preload.cjs"]`.

### Alt C — mock better-sqlite3 (4–8 h)
1. Skapa `tests/mocks/better-sqlite3-inmemory.ts` som implementerar den
   mjuka del av better-sqlite3-API:t som services använder.
2. Stryker-specifik vite-alias: `better-sqlite3 → mocks/better-sqlite3-inmemory`.
3. Kräver att mock täcker: `prepare`, `run`, `get`, `all`, `exec`, `pragma`,
   `transaction`, `inTransaction`, `function`.

### Alt D (sista utväg) — scope-accept
Behåll mutation på `src/shared/` + öka invariant-täckning i fas 3 så
effekten blir likvärdig.

**Exit-kriterium:** Mutation score ≥85% på minst `result-service.ts`,
`invoice-service.ts`, `vat-service.ts`.

**Leverabler:** stryker.conf.json-uppdatering, ev. vitest.config.stryker.ts,
uppdaterad F-TT-002 i findings.md.

---

## Sprint TT-2 — Fas 3 full M-matrix (2–3 dagar)

**Scope:** 57 M-principer utan direkt invariant-test.

### Pass 1 — "billiga" scanners (1 dag, ~30 M)
Principer som kan verifieras med schema-scan, regex över source, eller enkla
trigger-tester. Kluster:

| Kluster | M-IDs | Typ |
|---|---|---|
| Trigger-säkerhet | M93, M94, M95, M118, M140, M142, M151 | SQL trigger-test |
| Schema-scanners | M120, M122, M123, M125, M126, M130 | pragma+sql_master scan |
| Source-scanners | M128, M131, M133, M144, M148, M150, M153 | AST eller regex |
| E2E-meta | M115, M116, M117, M147, M148 | doc + manifest-scan |

### Pass 2 — integrationstester (1–2 dagar, ~27 M)
Principer som kräver IPC-flöde eller multi-step-uppsätt. Kluster:

| Kluster | M-IDs | Typ |
|---|---|---|
| Betalnings-integritet | M99, M101, M110, M111, M112, M113, M114 | end-to-end payment |
| Bank | M152, M153, M154 | bank reconciliation flow |
| Korrigeringar | M138, M139, M140 | credit note + correction chain |
| Stamdata | M158 | counterparty/product scoping |
| Layers | M129, M134, M135, M136, M137, M141, M143, M145, M146 | redan täckta indirekt — verify only |

**Leverabler:** ~10 nya test-filer i `tests/invariants/` + uppdaterad
m-checklist.md med 100% täckning.

**Risk:** Nya findings förväntas. Varje ska `.skip`:as + loggas med F-TT-NNN.

---

## Sprint TT-3 — Fas 4 state-machines (2 dagar)

### Dag 1 — InvoiceLifecycle
**Commands:** SaveDraft, UpdateDraft, Finalize, Pay(amount), PayBulk,
Credit (creates credit-note), Correct, Delete(only-draft), ClosePeriod.

**Invarianter:**
- `status` matchar `SUM(payments) vs total_amount_ore` enligt M101-semantiken
- `paid_amount_ore <= total_amount_ore`
- `corrected_by_id` är unique
- period-closed blockerar booking

**Uppsättning:** Shadow-model i TypeScript + real DB via createTestDb.
Använd `_payInvoiceTx` internal-variant för att undvika dubbla transaktioner.
200+ runs à 20–50 commands.

### Dag 2 — BankReconciliation + FYLifecycle

**BankReconciliation:**
- States per TX: unmatched → suggested → matched → unmatched
- Commands: ImportStatement, AutoSuggest, AcceptSuggestion, ManualMatch,
  Unmatch, ClassifyAsFee
- Invarianter: M154 en-gångs-lås, `match_method` legal, auto-suggest
  deterministisk (M153)

**FYLifecycle:**
- States: open → closed → reopened (max 1 gång)
- Commands: CreateFY, OpenPeriod, ClosePeriod, BookEntry, CreateNewFY,
  ReopenPeriod, ReTransferOB
- Invarianter: ingen booking efter close, IB matchar UB, M95-overlap

**Leverabler:** 3 testfiler i `tests/state-machine/`, 200+ runs per.
Shrunk motexempel → regression-test i `tests/<name>-regression.test.ts`.

---

## Sprint TT-4 — F-TT-002 post-fix: expandera fas 1 (0.5 dag)

**Förutsätter:** Sprint TT-1 klar.

1. Uppdatera `stryker.conf.json` mutate-lista till original 11 filer.
2. Kör full Stryker-run (30–90 min).
3. För varje fil med <85%: skriv killer-tester för överlevande mutanter
   (iterera 1–2 rundor).
4. Mål per fil:
   - `money.ts` ≥ 95% ✅ (redan 100%)
   - `result-service.ts` ≥ 90%
   - Övriga ≥ 85%

**Leverabler:** test-tillägg per service, uppdaterat mutation-report i
`reports/mutation/`.

---

## Sprint TT-5 — Fas 5 migrations snapshot-matrix (1.5 dagar)

### Fas A — seed-fixtures via IPC (1 dag)
Behövs: Electron-runtime-session för att kalla IPC. Alternativt: batch-
script som spawnar Electron headless med ett seeding-skript.

**Approach:** Skapa `scripts/seed-snapshot.mjs` som:
1. Startar Electron med `FRITT_TEST=1 FRITT_DB_PATH=tests/fixtures/db-snapshots/v<N>.db`
2. Anropar IPC via window.api för att seeda minimal data (1–2 bolag, 10
   fakturor, 5 kostnader, 1 korrigering, 1 bank-match)
3. Avslutar gracefully, lämnar DB-filen kvar

Kör en gång per PRAGMA-version som är "meningsfull" (inte alla 47 — skippa
table-recreate-pass-through-versioner). Realistic subset: ~15 snapshots.

### Fas B — regression-matrix-test (0.5 dag)
`tests/migrations/snapshot-matrix.test.ts`:
1. För varje `tests/fixtures/db-snapshots/v<N>.db`:
   - Öppna, kör migrations från version N till 47
   - Verifiera schema-end-state matchar fresh-DB
   - Verifiera FK-integrity
   - Verifiera specifika invarianter: alla fakturor belopp, balance, paid_amount

### Fas C — legacy-migration-test
`tests/migrations/legacy-encryption.test.ts`:
1. Seed okrypterad v47-DB
2. Kör `migrateLegacyToEncrypted`
3. Verifiera alla rader bevarade, user_version = 47

**Leverabler:** `tests/fixtures/db-snapshots/*.db` (gitignored, checked-in
seed-script), 2 nya test-filer, `npm run test:migrations:matrix`.

---

## Sprint TT-6 — Fas 6 E2E journeys (1.5 dagar)

**Förutsätter:** Playwright/Electron-session för körning.

### Dag 1 — legacy-migration + bank-E2E

**e11-legacy-migration.spec.ts:**
- Seed okrypterad v47-DB på legacy-path
- Starta app som ny användare via `__test:createAndLoginUser`
- Trigger legacy-import från Settings
- Verifiera datarow-by-row (företag, fakturor, verifikationer)

**e12-bank-reconciliation.spec.ts:**
- Seed 30 fakturor + kostnader
- Importera camt.053-fil från fixture (`tests/fixtures/bank/sample.camt.053`)
- Kör auto-match
- Manuellt match resterande (UI-klick)
- Klassificera avgifter
- Unmatch en, rematcha
- Verify `SUM(payments) === SUM(matched_tx_amount)`

### Dag 2 — multi-user + auth + en-månads-journey

**e13-multi-user-auth.spec.ts:**
- Skapa 3 användare via `__test:createUser`
- Logga in A, skapa data, logga ut
- Logga in B, verifiera ingen A-data synlig
- Sätt auto-lock 1 min, sleep, verifiera låst
- Recovery-login via phrase

**e14-monthly-flow.spec.ts:** (fyller luckan i prompten-journey 1)
- 20 fakturor + 15 kostnader över en månad
- Bulk-betalning
- Kreditnota + korrigering
- Momsrapport + SIE4-export + roundtrip-import

**Leverabler:** 4 nya specfiler, uppdaterad `tests/e2e/README.md` med
data-testid-whitelist (M117), ev. nya `__test:*` helpers.

---

## Sprint TT-7 — Fas 7 auth-pentest + memory-dump (1 dag)

### Morning — auth-pentest
`tests/security-fuzz/auth-pentest.test.ts`:

**Timing-attack:**
1. 1000 login-försök med lösenord av varierande längd + olika prefix-match
2. Mät response-tid per försök
3. Statistisk σ ≤ 20% mellan grupper → constant-time-verifiering OK

**Rate-bypass:**
1. Starta 10 parallella login-promises mot samma user (Promise.all)
2. Verifiera att max 1 lyckas innan backoff triggas

**Recovery-brute:**
1. 10000 random phrases
2. 0 matches (statistiskt garanterat, verifiera ingen cache-leak)

**Path-traversal:**
1. `FRITT_AUTH_ROOT=../../../etc`
2. `displayName = "../../secret"`
3. Verifiera att fs-operationer normaliseras

### Afternoon — memory-dump-defensiv
`tests/security-fuzz/memory-secrets.test.ts`:
1. Login + logout
2. Försök trigga GC (`global.gc?.()` om flagga satt)
3. Dumpa heap via `v8.writeHeapSnapshot`
4. Grep för klartextlösen + K-bytes (best-effort, V8-garantier svaga)
5. Hit → warning, inte fail (dokumentera)

**Leverabler:** 2 testfiler, `docs/security-test-report.md` med fynd.

---

## Sammanfattande tidslinje

```
Vecka 1:  TT-1 (Stryker unlock)         [1–2 d]
          TT-2 (M-matrix)               [2–3 d]
Vecka 2:  TT-3 (state-machines)         [2 d]
          TT-4 (mutation expand)        [0.5 d]
          TT-5 (snapshot-matrix)        [1.5 d]
Vecka 3:  TT-6 (E2E journeys)           [1.5 d]
          TT-7 (auth-pentest + memory)  [1 d]
```

**Total: 9.5–11.5 dagar** (8–12 beroende på om TT-1 lyckas med Alt A eller
behöver gå till Alt C).

## Körordning-beroenden

- **TT-1 → TT-4** (mutation expand kräver Stryker-fix)
- **TT-2** oberoende, kan köras parallellt med TT-1
- **TT-3** oberoende, fristående
- **TT-5** kräver Electron-aktiverad session (miljö, inte kod-beroende)
- **TT-6** kräver Electron + Playwright + eventuellt nya `__test:*` helpers
- **TT-7** fristående, ren vitest

**Rekommenderad ordning:** TT-1 → TT-2 → TT-3 → TT-4 → TT-7 → TT-5 → TT-6
(TT-5 och TT-6 sist eftersom båda kräver miljö-setup som kan göras i samma
session).

## Exit-kriterier för hela backlogen

- [ ] Mutation score ≥85% på 11 kärnservices (TT-1+TT-4)
- [ ] 62/62 M-principer med minst ett invariant-test (TT-2)
- [ ] 3 state-machines gröna med 200+ runs (TT-3)
- [ ] Migrations-snapshot-matrix grön för ≥15 versioner (TT-5)
- [ ] 4 nya E2E-specs gröna (TT-6)
- [ ] Auth-pentest grönt: timing σ ≤20%, 0 rate-bypass, 0 path-traversal (TT-7)
- [ ] `docs/security-test-report.md` publicerad (TT-7)
- [ ] Alla nya findings har antingen fix-commit eller `.skip`+finding-ID
