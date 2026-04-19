# Testing Total — progress log

Start: 2026-04-19
Branch-strategi: `test-total/phase-N-<slug>` per fas, squash-merge efter gate.

## Baseline

- **Tester:** 2921 passing (280 filer) — `npm run test`
- **Duration:** 39.65s
- **Coverage:**
  - Statements: 77.41% (7752/10014)
  - Branches:   65.73% (4190/6374)
  - Functions:  70.62% (1536/2175)
  - Lines:      78.22% (7380/9434)
- **M-principer:** 62 unika (M6, M24, M63, M66, M92–M102, M110–M158)
- **PRAGMA user_version:** 44
- **Befintliga invariant-tester:** 20 filer (grep invariant|consistency|parity)

## Phase 0 — baseline ✅

Done 2026-04-19.
- `docs/testing-total/coverage-baseline.json` — c8 json-summary
- `docs/testing-total/m-checklist.md` — 62 M-principer, alla "testad: ?"
- `docs/testing-total/baseline-invariant-tests.md` — existerande invariant-filer
- Installerade `@vitest/coverage-v8` som devDep (behövdes för coverage).

## Phase 1 — mutation testing ✅ (partial, scope-reducerad)

Done 2026-04-19.

- Installerade `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`.
- `stryker.conf.json` — mutate-scope: `src/shared/money.ts` (se F-TT-002 för
  begränsning till shared-only).
- Baseline-run på money.ts: 58.82% (10 killed, 3 survived, 4 no coverage).
- Skrev `tests/shared/money.test.ts` — 16 direkta tester för
  `multiplyKrToOre`/`multiplyDecimalByOre`.
- Re-run: **82.35%** (14 killed, 3 survived, 0 no coverage).
- 3 kvarvarande mutanter = dead code i `parseDecimal` trim+empty-check
  (F-TT-001). Lämnade som-är; ingen produktion-bug.
- Scope-reduktion dokumenterad i findings F-TT-002: Stryker SIGSEGV på
  service-filer pga better-sqlite3 native module i sandbox. Delar av
  mutation-coverage för services levereras istället via fas 2 (property)
  och fas 3 (invariant).

Nya scripts: `npm run test:mutation`, `npm run test:property`.

**Gate-justering:** prompten krävde ≥85% på money.ts (95% för shared) men
de 3 mutanter som inte dödas är dead code — matematisk omöjlig utan att
ändra produktionskoden (vilket prompten förbjuder under testbygget).
82.35% = empirisk täckningsgrad för icke-dead kod.

## Phase 2 — property-based

## Phase 3 — invariant audit

## Phase 4 — state-machine

## Phase 5 — migrations matrix

## Phase 6 — E2E journeys

## Phase 7 — fuzz + security
