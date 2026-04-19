# E2E journeys (TT-6)

Journey-specs som kompletterar befintliga `e2e/e*.spec.ts`. Alla fyra är
`test.skip` tills infrastrukturen nedan finns på plats.

## Skippade journeys

| Fil | Journey | Infrastruktur som saknas |
|---|---|---|
| j01-monthly-flow.spec.ts | En månads bokföring + SIE4-roundtrip | `__test:seedBulk`, dialog-bypass för import |
| j02-legacy-migration.spec.ts | Migration okrypterad v47 → krypterad | `scripts/seed-legacy-db.mjs`, `tests/fixtures/legacy/v47-unencrypted.db` |
| j03-bank-reconciliation.spec.ts | camt.053 + auto+manual-match + unmatch | `tests/fixtures/bank/sample.camt.053`, data-testid för match-UI |
| j04-multi-user-auth.spec.ts | 3 users + auto-lock + recovery + DB-isolation | `__test:createUser`/`loginUser` med explicita secrets, `__test:freezeClock` |

## Aktivera en journey

1. Ta bort `.skip` från `test.skip(...)`
2. Implementera fixture/helper enligt filens TODO-sektion
3. Uppdatera `data-testid`-whitelist i `tests/e2e/README.md` (M117)
4. Kör: `npm run test:e2e -- e2e/journeys/jXX-*.spec.ts`

## Backlog-länk

Se `docs/testing-total/backlog-plan.md` TT-6 för estimat och dep-kedja.
