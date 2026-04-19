# Phase 6 — E2E user journeys (plan / backlog)

**Status:** Scope-reducerad. Prompten specificerade 5 journeys som separata
filer i `e2e/journeys/`. Nuvarande E2E-infra har redan 9 spec-filer som täcker
~70% av prompten-scope:

| Prompten-journey | Täcks av |
|---|---|
| 1. En månads bokföring | e02-invoice + e03-expense + e05-export (delvis) |
| 2. Årsbokslut | e06-year-end (delvis) |
| 3. Migration från legacy | Inte täckt — backlog |
| 4. Bankavstämning E2E | Inte täckt — backlog |
| 5. Multi-user + auth | Inte täckt — backlog |

## Körförutsättningar

- Playwright + Electron-runtime krävs
- `npm run test:e2e:critical` kör kritiska filer
- Dialog-bypass (M147) konfigurerat för save/open-dialoger
- `window.__testApi` (M115/M148) kräver `FRITT_TEST=1` eller `NODE_ENV=test`

## Rekommenderad fortsättning

1. **Legacy-migration** är högsta-värde-luckan (rör auth, SQLCipher, migration
   från okrypterad v44 till krypterad). Kräver test-fixture med seed
   okrypterad DB på känt path.
2. **Bankavstämning** — e02/e03 täcker betalning men inte camt.053-import +
   auto-match + manual-match-flödet. Kräver test-fixture med camt.053-fil.
3. **Multi-user + auth** — auto-lock, recovery-login, isolation mellan
   användare. Kräver `__test:createAndLoginUser` + session-manipulation.

## Körning

Fas 6 kan inte slutföras i vitest-only-session — prompten kräver
`npm run test:e2e` med Playwright. Scaffold lämnas för manuell/Claude-
assisterad körning i Electron-aktiverad session.
