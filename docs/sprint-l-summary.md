# Sprint L — Lint-baseline-städ (187 → 95) ✅ KLAR

**Session:** 2026-04-18 (Sprint L, direkt efter Sprint K)
**Scope:** Lint-baseline-städ enligt backlog. IBAN-prefix-dispatch
eskalerades efter scope-granskning (kräver spec — se Scope-utelämningar).
**Estimat:** ~1-1.5 SP. **Faktiskt:** ~1 SP.

## Leverans

### Lint-fel: 187 → 95 (−92, 49 %)

| Regel | Före | Efter | Fixat |
|---|---:|---:|---:|
| `@typescript-eslint/no-unused-vars` | 76 | 0 | −76 |
| `@typescript-eslint/no-require-imports` | 5 | 0 | −5 |
| `no-restricted-syntax` (toISOString UTC-risk) | 8 | 0 | −8 |
| `jsx-a11y/no-static-element-interactions` (rule not found) | 6 | 0 | −6 |
| `prettier/prettier` (auto-fix) | 2 | 0 | −2 |
| `@typescript-eslint/no-explicit-any` | 96 | 95 | −1 |
| **Totalt** | **193** | **95** | **−98** |

(193 — inte 187 som ursprungligen uppskattades.)

### Detaljer per kategori

**`no-unused-vars` (−76):**
- Uppdaterad `eslint.config.mjs` med `varsIgnorePattern: '^_'`,
  `caughtErrorsIgnorePattern: '^_'`, `destructuredArrayIgnorePattern: '^_'`
  (matchar befintlig `argsIgnorePattern: '^_'`).
- Tog bort oanvända imports i ~30 filer (src + tests).
- Prefixade lokala unused vars med `_` där de är behövda för
  destructuring-kontrakt (t.ex. `_fy`, `_vn1`, `_rr`).
- Tog bort hel funktion `ftsOrFallback` (truly dead code) +
  `bookExpense` test-helper (unused).
- Tog bort obsolet `totalDebit` / `totalCredit`-beräkning i
  `sie4-import-validator.ts` (ersatt av sum-check).

**`no-require-imports` (−5):**
- `src/main/ipc-handlers.ts:1330` — conditional `require('./ipc/test-handlers')`
  kvarstår (produktion ska inte bundla test-handlers); eslint-disable-
  comment med motivering.
- `tests/e2e/pdf-batch-export.spec.ts` — `require('path')` → top-level
  `import path from 'path'`.
- `tests/e2e/sie4-import.spec.ts` — `require('os')` → `import os from 'os'`.
- `tests/system/S13-bulk-payment.test.ts` — 2× `require('iconv-lite')`
  → top-level `import * as iconv from 'iconv-lite'`.

**`no-restricted-syntax` (toISOString UTC-risk, −8):**
- `DisposeDialog.tsx`, `FixedAssetFormDialog.tsx`, `PageFixedAssets.tsx`
  (2× + 1× + 1×) — `new Date().toISOString().slice(0, 10)` →
  `todayLocal()` från `shared/date-utils.ts`.
- `backup-service.ts:178` — `getNow().toISOString().slice(0, 19)` →
  `localTimestampFromNow()` (ny helper i `main/utils/now.ts`).
- `pain001-export-service.ts:47` — samma utbyte.
- `sie4-import-service.ts:393-394` — `periodStart.toISOString().slice(0, 10)`
  → `localDateFromDate(periodStart)` (ny helper, local-tid från Date-
  instans, inte "now").

**`jsx-a11y/no-static-element-interactions` (rule not found, −6):**
- Pluginen `jsx-a11y` är INTE installerad/konfigurerad i
  `eslint.config.mjs`. Disable-kommentarer för regeln gav "rule not
  found"-fel. Tog bort kommentarerna i 6 dialog-filer.
- **Uppföljning:** Om vi installerar `eslint-plugin-jsx-a11y` i framtiden,
  kommer 6 backdrop-divs med `onKeyDown` att failar — kräver antingen
  `role="button"` på backdrop eller re-install av disable-kommentarer.
  Dokumenteras som framtida sprint.

### Nya helpers (main/utils/now.ts)

- `localDateFromDate(d: Date): string` — YYYY-MM-DD från specifik Date,
  local tid (inte UTC). För periodStart/periodEnd osv.
- `localTimestampFromNow(): string` — YYYY-MM-DDTHH:MM:SS, respekterar
  FRITT_NOW (M150). För backup-filnamn, pain.001-XML, export-headers.

### Bevarat

- `@typescript-eslint/no-explicit-any` (**95 kvar**) — scope för stort
  för en sprint. 95 instanser fördelade över ~15 test-filer + 1 src-fil.
  Mest `as any` i test-asserts där typ-säkerhet är låg. Eskaleras som
  separat backlog-item.
- `check:lint-new`-gate blockerar **nya** no-any-instanser via diff-
  scoped-lint. Baseline kvarstår men växer inte.

## Verifiering

- **Lint:** 193 → **95 problems (95 errors, 0 warnings)**
- **TypeScript:** `npx tsc --noEmit` ✅ (inga fel)
- **Vitest:** 256 testfiler, **2576 tester passerar** (samma som Sprint K)
- `check:m133` + `check:m133-ast` ✅ (opåverkade)

## Scope-utelämningar (inte Sprint L)

### IBAN-prefix-dispatch (eskalerad)

Listat som backlog-item från Sprint F P4-scope-lås. Audit visade att
scope är **underspecat**:
- "IBAN-prefix-dispatch" kan tolkas som (a) IBAN-prefix-baserad bank-
  identifiering i classifier-heuristik, (b) transaction-routing baserat
  på IBAN-prefix, (c) helt egen mapping-tabell för IBAN-prefix →
  klassificering.
- Existerande `bank-fee-classifier.ts` har `BANK_NAME_RE` som redan
  matchar counterparty-namn mot bank-mönster. Utvidgning till IBAN-
  prefix kräver svensk bankkod-tabell (5000-xxx = SEB, 8000-xxxxx =
  Swedbank osv) — underhållsbörda + scope-question.
- Alternativ design: DB-tabell `iban_prefix_mappings` (analog med
  `bank_tx_code_mappings` från Sprint F P4) med CRUD i Settings.
  Men utan förklarade krav är det pre-emptive arkitektur.

**Eskaleras** till separat sprint med dedikerad spec + design-review
(likt F49-c-spec processen).

### no-explicit-any cleanup

95 kvarvarande. Mest tedious (kräver typ-analys per fall). Följs av
diff-scoped-gate så baseline växer inte. Separat sprint med fokus
på typ-säkerhet i test-filer.

## Filer (delta mot Sprint K)

**Modifierade (~40):** src-filer (service + renderer) + test-filer.

**Ändrad config (1):**
- `eslint.config.mjs` — utvidgade `no-unused-vars` med varsIgnorePattern
  + destructuredArrayIgnorePattern + caughtErrorsIgnorePattern.

**Nya helpers (0 nya filer, 2 nya funktioner):**
- `localDateFromDate(d: Date)` i `main/utils/now.ts`
- `localTimestampFromNow()` i `main/utils/now.ts`

**Ingen ny M-princip, ingen ny migration, inga nya IPC-kanaler,
inga nya ErrorCodes.**

## Kvar i backlog

- **IBAN-prefix-dispatch** — eskalerad (kräver spec).
- **no-explicit-any cleanup** (95) — separat sprint.
- **jsx-a11y-plugin installation** — om vi vill aktivera a11y-regler.
- **Sprint H (T3.a F62-e)** — blockerad på revisor-samråd (ADR 002).
- **T3.d rest (MT940 + BGC)** — H2 2026.
- **Radix UI-migration för dialoger** — nice-to-have.
