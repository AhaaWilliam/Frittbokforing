# Sprint M — jsx-a11y aktiverad + no-any cleanup ✅ KLAR

**Session:** 2026-04-18 (Sprint M, direkt efter Sprint L)
**Scope:** (1) jsx-a11y-plugin feasibility under eslint 10 via `--force`,
(2) no-explicit-any cleanup i test-filer.
**Estimat:** ~2 SP. **Faktiskt:** ~2 SP.

## Bakgrund

Föregående Sprint M-försök (commit 2fb1e05) abandonerade efter att
`--legacy-peer-deps` tog bort kritiska peer-deps (babel,
electron-windows-sign) och bröt TS-modulupplösning för
@testing-library/react. Kvarlämnade `.claude/launch.json`
dev-server-config som biprodukt. Lärdom i den commit: "Prova `--force`
istället för `--legacy-peer-deps`".

Denna sprint följer den lärdomen.

## Leverans

### P1 — jsx-a11y aktiverad under eslint 10

**Installerat:** `eslint-plugin-jsx-a11y@6.10.2` via `npm install --force`
(peer-dep-varning: plugin stöder `^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9`,
vi kör eslint@10).

**Konfigurerat:** `eslint.config.mjs` utvidgad med:
```js
import jsxA11y from 'eslint-plugin-jsx-a11y'
// ...
plugins: { ..., 'jsx-a11y': jsxA11y },
rules: { ..., ...jsxA11y.configs.recommended.rules, ... }
```

**Feasibility-verifiering:**
- Syntet-test: `<img>` utan alt, `<div onClick>`, etc. → alla 3 förväntade
  regler triggas (alt-text, click-events-have-key-events,
  no-static-element-interactions).
- TS check: ✅ oförändrat
- Vitest: ✅ 2576/2576 (ingen regression från force-install)
- better-sqlite3 native rebuild: ✅

**Baseline efter aktivering:** 46 nya violations i `src/renderer/` fördelade:

| Regel | Antal |
|---|---:|
| `jsx-a11y/label-has-associated-control` | 20 |
| `jsx-a11y/no-static-element-interactions` | 12 |
| `jsx-a11y/click-events-have-key-events` | 9 |
| `jsx-a11y/no-noninteractive-element-interactions` | 2 |
| `jsx-a11y/role-has-required-aria-props` | 1 |
| `jsx-a11y/no-noninteractive-tabindex` | 1 |
| `jsx-a11y/no-autofocus` | 1 |
| **Totalt** | **46** |

**Ingen fil har >7 violations**, vilket gör framtida cleanup per-fil lätt
att parkettera.

**Top-filer:**
- `CreateAccrualDialog.tsx` — 7
- `PageAccruals.tsx` — 4
- `FixedAssetFormDialog.tsx` — 4
- `StepCompany.tsx` — 3

**Gate-strategi:** `check:lint-new` (diff-scoped) blockerar automatiskt
nya jsx-a11y-violations i ändrade filer utan att kräva full baseline-
fixning. Samma approach som för no-any-baselinen.

### P2 — no-explicit-any: 95 → 0

Alla 95 no-any-violations eliminerade genom att lägga till lokala
row-type-interfaces och ersätta `as any` → `as TypedRow`.

**Per-fil breakdown:**

| Fil | Före | Efter |
|---|---:|---:|
| `tests/system/S01-invoice-lifecycle.test.ts` | 39 | 0 |
| `tests/system/S02-expense-lifecycle.test.ts` | 18 | 0 |
| `tests/system/S04-fiscal-year-transition.test.ts` | 10 | 0 |
| `tests/security/SEC02-db-constraints.test.ts` | 8 | 0 |
| `tests/system/S03-manual-entry-lifecycle.test.ts` | 6 | 0 |
| `tests/security/SEC04-financial-integrity.test.ts` | 6 | 0 |
| `tests/system/S07-stamdata-crud.test.ts` | 3 | 0 |
| `tests/system/S09-edge-cases.test.ts` | 2 | 0 |
| `tests/session-34-cross-fy.test.ts` | 2 | 0 |
| `tests/s59-backup-service-timezone.test.ts` | 1 | 0 |
| **Totalt** | **95** | **0** |

**Mönster som ersattes:**
- `.get(id) as any` → `.get(id) as InvoiceRow` (eller motsvarande
  lokal typ)
- `.all() as any[]` → `.all() as JournalLineRow[]`
- `(l: any) => ...` i filter/find/reduce → `(l: JournalLineRow) => ...`

**S07 använder shared `Counterparty`-type** från `src/shared/types.ts`.
Övriga filer definierar lokala row-interfaces inline för att undvika
bred import-yta i test-helpers.

### Ingen ny infrastruktur

- Inga nya M-principer.
- Inga nya migrationer (PRAGMA `user_version`: 43 oförändrat).
- Inga nya IPC-kanaler.
- Inga nya ErrorCodes.

## Verifiering

- **Lint:** 141 → 46 problems (46 errors, 0 warnings). De 46 är
  jsx-a11y-baselinen (nya yta efter aktivering). No-any: 95 → 0.
  Prettier/no-unused: 0 oförändrat.
- **TypeScript:** `npx tsc --noEmit` ✅
- **Vitest:** 2576 tester ✅ (samma som Sprint L tip — inga regressions
  från plugin-install eller type-refactor)
- **check:m133** + **check:m133-ast** ✅ (opåverkade)
- **check:lint-new** ✅ (diff-scoped — ändrade filer är lint-rena)

## Filer (delta mot Sprint L tip)

**Modifierade config (2):**
- `eslint.config.mjs` — jsx-a11y import + plugin + recommended.rules
- `package.json` + `package-lock.json` — eslint-plugin-jsx-a11y@6.10.2

**Modifierade test-filer (10):**
- `tests/s59-backup-service-timezone.test.ts`
- `tests/session-34-cross-fy.test.ts`
- `tests/security/SEC02-db-constraints.test.ts`
- `tests/security/SEC04-financial-integrity.test.ts`
- `tests/system/S01-invoice-lifecycle.test.ts`
- `tests/system/S02-expense-lifecycle.test.ts`
- `tests/system/S03-manual-entry-lifecycle.test.ts`
- `tests/system/S04-fiscal-year-transition.test.ts`
- `tests/system/S07-stamdata-crud.test.ts`
- `tests/system/S09-edge-cases.test.ts`

**Inga produktionsändringar.** Alla edits i config eller test-filer.

## Kvar i backlog

Sprint M stängde 2 backlog-items. Efterföljande prioritering:

- **jsx-a11y-baseline (46)** — ny backlog-yta. Inte brådskande eftersom
  `check:lint-new` förhindrar regression. Bästa stängning: per-fil
  när ägaren ändå rör filen.
- **IBAN-prefix-dispatch** — fortsatt eskalerad (kräver spec).
- **Sprint H (T3.a F62-e)** — blockerad på revisor-samråd (ADR 002).
- **T3.d rest (MT940 + BGC)** — H2 2026.
- **Radix UI-migration för dialoger** — nice-to-have.
- **Space-på-rad-togglar-checkbox** (F49-c backlog, rad-nivå polish).

## Not om `--force`-install

`npm install --force` accepterar peer-dep-varningar utan att modifiera
dep-träd-strukturen. Till skillnad från `--legacy-peer-deps` (Sprint M
första försök) raderas inga deps. Endast varningar i output —
installationen är semantiskt identisk med en korrekt peer-dep-
konfiguration.

Framtida uppgradering till `eslint-plugin-jsx-a11y` v7+ (om/när den
släpps med eslint 10-support) kan göras utan `--force`-flagga.
