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

## Phase 1 — mutation testing

(in progress)

## Phase 2 — property-based

## Phase 3 — invariant audit

## Phase 4 — state-machine

## Phase 5 — migrations matrix

## Phase 6 — E2E journeys

## Phase 7 — fuzz + security
