# Sprint 25 — F40 VAT-testhardering

**Typ:** Implementation-sprint (enbart tester, ingen produktionskod).
**Baseline:** 1511 vitest-tester, HEAD vid S25-start.
**Mål:** 1511 → 1521 vitest. Inga regressioner.

---

## Bakgrund

F40 identifierades i Sprint 18 S65b: "F27-testskydd täcker bara netto,
moms-skalning otestad i InvoiceTotals". S25 pre-skoping research (2026-04-15)
bekräftade att renderer och backend använder identisk VAT-formel
(`Math.round(nettoOre * vat_rate)`) men att det saknas:

1. **Isolerade VAT-tester** — befintliga B2-tester assertar VAT som biprodukt
   av totalvalidering. En VAT-specifik regression kan maskeras av korrekt netto.
2. **Backend processLines VAT-tester** — ingen dedikerad test av invoice-service
   `processLines()` VAT-output.
3. **Renderer↔backend paritetstest** — inget bevis att båda paths ger identisk
   VAT för samma input. Samma lucka som F19 (BR/RR-konsistens) hade före S24b.

---

## Steg 0 — Preflight

```bash
set -euo pipefail
cd ~/fritt-bokforing
git status

CLEAN=$(git status --porcelain | wc -l)
[ "$CLEAN" = "0" ] || { echo "STOPP: working tree inte clean"; exit 1; }

CURRENT_BRANCH=$(git branch --show-current)
[ "$CURRENT_BRANCH" = "main" ] \
  || { echo "STOPP: fel branch ($CURRENT_BRANCH)"; exit 1; }

mkdir -p .s25-tmp
npm test -- --run > .s25-tmp/baseline-test-output.txt 2>&1 || true
PASSED=$(grep -oE 'Tests +[0-9]+ passed' .s25-tmp/baseline-test-output.txt \
         | grep -oE '[0-9]+' | tail -1)
PASSED=${PASSED:-UNKNOWN}
echo "Baseline: $PASSED passed"
[ "$PASSED" = "1511" ] || { echo "STOPP: baseline är $PASSED, förväntat 1511"; exit 1; }

npm run check:m131
npm run check:m133

if ! grep -q "^\.s25-tmp/" .gitignore 2>/dev/null; then
  echo ".s25-tmp/" >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore .s25-tmp working dir"
fi
```

### 0.1 Preflight-verifieringar

Signatur- och shape-verifieringarna nedan ska besvaras med kodinspektio
INNAN commit 1 startas. Svaren är redan spikade från S25 pre-skoping research
men verifieras vid sprint-start mot HEAD.

#### A. InvoiceTotals VAT-formel

```bash
# Verifiera att InvoiceTotals.tsx fortfarande använder denna formel:
grep -n "vatOre.*Math.round" src/renderer/components/invoices/InvoiceTotals.tsx
# Förväntat: Math.round(nettoOre * line.vat_rate)
```

**Spikad:** `const vatOre = Math.round(nettoOre * line.vat_rate)` (rad 13)

#### B. Backend processLines VAT-formel

```bash
# Verifiera processLines-formeln:
grep -n "lineVat.*Math.round\|effectiveRate" src/main/services/invoice-service.ts
# Förväntat: effectiveRate = rate / 100; lineVat = Math.round(lineTotal * effectiveRate)
```

**Spikad:** `effectiveRate = rate / 100`, `lineVat = Math.round(lineTotal * effectiveRate)` (rad 68-69)

#### C. processLines export-status

```bash
# processLines är idag privat (function, inte export function). Verifiera:
grep -n "export.*processLines\|function processLines" src/main/services/invoice-service.ts
```

**Om processLines är privat:** Commit 2 behöver antingen (a) exportera den
som `_processLines` (test-only-konvention), eller (b) testa indirekt via
saveDraft-retur. Alternativ (b) föredras — testar via publik API.

#### D. saveDraft return-shape

```bash
# Verifiera att saveDraft returnerar line_total_ore och vat_amount_ore:
grep -A 5 "line_total_ore\|vat_amount_ore" src/main/services/invoice-service.ts | head -20
```

**Spikad:** `processLines` returnerar `{ ...line, line_total_ore, vat_amount_ore }`.
saveDraft skriver dessa till DB. `getDraft` kan läsa tillbaka för assertion.

#### E. Nästa lediga M-nummer

```bash
NEXT_M=$(grep -oE "^## [0-9]+\.\s+.*\(M[0-9]+\)" CLAUDE.md \
         | grep -oE "M[0-9]+" | grep -oE "[0-9]+" | sort -n | tail -1)
RESERVED_M=$((NEXT_M + 1))
echo "Senaste M-regel: M$NEXT_M → Nästa lediga: M$RESERVED_M"
```

Spara `RESERVED_M` för commit 4 (förväntat M135).

---

## Commit 1 — Isolerade VAT-skalning-tester i InvoiceTotals

Lägg till i befintlig `tests/renderer/components/invoices/InvoiceTotals.test.tsx`
under en ny describe-sektion `B5: Isolerad VAT-skalning (F40)`.

### Testfall

```
B5.1: 25% moms — netto 10000 öre → VAT = Math.round(10000 * 0.25) = 2500
B5.2: 12% moms — netto 10000 öre → VAT = Math.round(10000 * 0.12) = 1200
B5.3: 6% moms — netto 9999 öre → VAT = Math.round(9999 * 0.06) = Math.round(599.94) = 600
B5.4: 25% moms, avrundningscase — netto 99 öre → VAT = Math.round(99 * 0.25) = Math.round(24.75) = 25
B5.5: 12% moms, avrundningscase — netto 199 öre → VAT = Math.round(199 * 0.12) = Math.round(23.88) = 24
```

### Assertionsstrategi

Använd `data-testid="total-vat-ore"` med `data-value`-attributet för att
assertera exakt VAT-belopp utan att behöva matcha formaterad text.
Befintliga B2-tester assertar via `byKr()` (formaterad text) — B5-tester
assertar via `data-value` (numeriskt) för att vara oberoende av netto-visning.

```tsx
const vatEl = screen.getByTestId('total-vat-ore')
expect(Number(vatEl.getAttribute('data-value'))).toBe(2500)
```

### Kör tester, committa

```bash
npm test -- --run > .s25-tmp/commit1-output.txt 2>&1
PASSED=$(grep -oE 'Tests +[0-9]+ passed' .s25-tmp/commit1-output.txt \
         | grep -oE '[0-9]+' | tail -1)
echo "Efter commit 1: $PASSED passed (förväntat 1516)"
[ "$PASSED" = "1516" ] || { echo "STOPP: fel test-antal"; exit 1; }

git add tests/renderer/components/invoices/InvoiceTotals.test.tsx
git commit -m "test(F40): isolerade VAT-skalning-tester i InvoiceTotals (B5.1–B5.5)

Täcker 25%, 12%, 6% med rena netto-belopp och avrundnings-edgecases.
Assertar via data-testid total-vat-ore data-value (numeriskt, locale-oberoende)
istället för formaterad text — oberoende av netto-rendering."
```

**Testdelta:** +5

---

## Commit 2 — Backend processLines VAT-tester via saveDraft

Skapa `tests/s25-backend-vat.test.ts`. Testar VAT-beräkning via den publika
saveDraft-APIn + getDraft read-back, INTE via privat `processLines` direkt.

### Testfall

```
V1: 25% moms — qty:1, unit_price_ore:10000, vat_code MP1 → vat_amount_ore = 2500
V2: 12% moms — qty:1, unit_price_ore:10000, vat_code MP2 → vat_amount_ore = 1200
V3: 6% moms — qty:1, unit_price_ore:9999, vat_code MP3 → vat_amount_ore = 600
V4: Fraktionell qty — qty:1.5, unit_price_ore:9999, vat MP1 → vat_amount_ore = ?
    (beräkna: lineTotal = Math.round(Math.round(150)*9999/100) = Math.round(14998.5) = 14999
     vat = Math.round(14999 * 0.25) = Math.round(3749.75) = 3750)
```

### Setup-mönster

Samma mönster som session-43: createTestDb(), createCompany(), hämta fyId.
Skapa counterparty (customer) + använd saveDraft med freeform-rader.
Läs tillbaka via getDraft och assertera line_total_ore + vat_amount_ore.

```bash
npm test -- --run > .s25-tmp/commit2-output.txt 2>&1
PASSED=$(grep -oE 'Tests +[0-9]+ passed' .s25-tmp/commit2-output.txt \
         | grep -oE '[0-9]+' | tail -1)
echo "Efter commit 2: $PASSED passed (förväntat 1520)"
[ "$PASSED" = "1520" ] || { echo "STOPP: fel test-antal"; exit 1; }

git add tests/s25-backend-vat.test.ts
git commit -m "test(F40): backend processLines VAT via saveDraft+getDraft

4 tester: 25%, 12%, 6% med rena belopp + fraktionell qty M131-canary.
Testar via publik API (saveDraft→getDraft) istället för privat processLines."
```

**Testdelta:** +4

---

## Commit 3 — Renderer↔backend VAT-paritetstest

Skapa `tests/s25-vat-parity.test.ts`. Testar att InvoiceTotals (renderer)
och processLines (backend via saveDraft) ger identisk VAT för samma input.

### Arkitektur

Testet beräknar VAT med renderer-formeln (samma formel som InvoiceTotals,
inline i testet) och jämför med backend-resultatet (saveDraft→getDraft read-back).

```
P1: 3 rader med blandade momssatser (25%, 12%, 6%) — per-rad VAT identisk
P2: F44-canary — qty=1.5, price=99.99, 25% → renderer och backend ger identisk VAT
```

### Viktig design-not

Paritetstestet beräknar INTE via InvoiceTotals-render (jsdom) + saveDraft (SQLite)
i samma test — det skulle kräva dubbla vitest-environments. Istället:

1. Extrahera renderer-formeln som ren funktion (eller inline den i testet)
2. Jämför mot backend-resultatet via saveDraft→getDraft
3. Assert: `rendererVat === backendVat` per rad

Om formeln ändras i InvoiceTotals.tsx men inte i testet, fångas det av B5-testerna
(commit 1). Om formeln ändras i backend men inte testet, fångas det av V-testerna
(commit 2). Paritetstestet fångar divergens mellan de två.

```bash
npm test -- --run > .s25-tmp/commit3-output.txt 2>&1
PASSED=$(grep -oE 'Tests +[0-9]+ passed' .s25-tmp/commit3-output.txt \
         | grep -oE '[0-9]+' | tail -1)
echo "Efter commit 3: $PASSED passed (förväntat 1522)"
[ "$PASSED" = "1522" ] || { echo "STOPP: fel test-antal"; exit 1; }

git add tests/s25-vat-parity.test.ts
git commit -m "test(F40): renderer↔backend VAT-paritetstest (M135-kandidat)

2 parity-tester: blandade momssatser + F44-canary. Fångar divergens
mellan InvoiceTotals-formel och processLines-formel.
Kandidat för M135 (dual-implementation paritets-test)."
```

**Testdelta:** +2 (totalt vid commit 3: 1511 → 1522)

**Not:** Totalt 11 nya tester, inte 10 — 5 (commit 1) + 4 (commit 2) + 2 (commit 3).

---

## Commit 4 — Sprint-avslut: F40 stängd + STATUS.md

### 4.1 Stäng F40 i docs/bug-backlog.md

```markdown
### F40 — F27-testskydd täcker bara netto, moms-skalning otestad i InvoiceTotals ✅ STÄNGD (Sprint 25)
**Stängd:** Sprint 25. 5 isolerade VAT-tester (B5.1–B5.5) i InvoiceTotals,
4 backend-tester via saveDraft+getDraft, 2 renderer↔backend paritets-tester.
Alla tre momssatser (25%, 12%, 6%) + avrundnings-edgecases + F44-canary täckta.
**S25 pre-skoping research:** Ingen beräkningsdivergensbugg hittades — renderer
och backend använder identisk formel (M131 Alt B). Sprinten är testhardering,
inte bugfix.
```

### 4.2 Överväg M\<RESERVED_M\> för dual-implementation paritets-test

Om commit 3-mönstret (paritets-test mellan renderer-formel och backend-formel)
bedöms värdefullt som generell princip:

```markdown
## NN. Dual-implementation paritetstest (M<RESERVED_M>)

**M<RESERVED_M>.** När samma beräkning implementeras i både renderer (preview)
och main process (bokföring) ska en paritets-test verifiera att båda ger
identisk output för samma input. Testet assertar per-rad-likhet, inte bara
totaler, för att fånga kompensationsfel.

Motivering: F19 (BR/RR-divergens) och F40 (VAT-testet) exponerade samma
mönster — dual-implementationer som kan glida isär utan att något enskilt
test fångar det. Paritetstestet är vakten.

Referens: `tests/s24b-br-rr-consistency.test.ts` (all-consumers-identical),
`tests/s25-vat-parity.test.ts` (renderer↔backend VAT).
```

**Beslut vid sprint-avslut:** Om mönstret känns etablerat nog, lägg till M-regeln.
Om det bara gäller dessa två fall, dokumentera i STATUS.md som mönster-observation
utan M-regel-promotion.

### 4.3 STATUS.md

```markdown
## Sprint 25 — F40 VAT-testhardering ✅ KLAR

Session S25. F40 (moms-skalning otestad i InvoiceTotals) stängd.
Testbaslinje: 1511 → 1522 vitest (+11).
Ingen produktionskod ändrad — enbart testhardering.

Tester tillagda:
- 5 isolerade VAT-skalning (InvoiceTotals B5.1–B5.5)
- 4 backend processLines VAT via saveDraft+getDraft
- 2 renderer↔backend paritetstest

Pre-skoping research-findings: F41 + F43 stale-closed (6 totalt under
S24b/S25 process-audit). F39 pinnad som dokumentations-finding.
```

### 4.4 Slutgiltig verifiering

```bash
npm test -- --run > .s25-tmp/commit4-final.txt 2>&1
PASSED=$(grep -oE 'Tests +[0-9]+ passed' .s25-tmp/commit4-final.txt \
         | grep -oE '[0-9]+' | tail -1)
echo "Slutgiltig vitest-totalsumma: $PASSED (förväntat 1522)"
[ "$PASSED" = "1522" ] || { echo "STOPP: fel slutsumma"; exit 1; }

npm run check:m131
npm run check:m133

git add CLAUDE.md STATUS.md docs/bug-backlog.md
git commit -m "docs: Sprint 25 klar — F40 stängd, VAT-testhardering komplett"
```

**Testdelta:** +0

---

## Stoppvillkor

- [ ] Alla 1511 baseline-tester passerar (inga regressioner)
- [ ] Vitest-suite efter sprint: 1522 passed (1511 + 11)
- [ ] M131-check passerar
- [ ] M133-check passerar
- [ ] B5.1–B5.5 assertar VAT via data-testid (numeriskt, locale-oberoende)
- [ ] V1–V4 testar backend VAT via saveDraft→getDraft (publik API)
- [ ] P1–P2 paritets-tester: renderer-formel === backend-VAT per rad
- [ ] F40 stängd i docs/bug-backlog.md
- [ ] STATUS.md uppdaterad
- [ ] CLAUDE.md: M\<RESERVED_M\> tillagd OM mönstret bedöms generellt

---

## Out of scope

- Produktionskod-ändringar (ingen bugg hittades)
- ExpenseTotals VAT-tester (samma formel som InvoiceTotals, täcks indirekt)
- E2E-test (VAT är interna beräkningar, inte synliga i UI utöver formaterade belopp)
- F39 (_kr-suffix dokumentation) — stängs inom valfri fakturering-sprint
- Fas 6-batchen (9 gröna findings) — skopar separat efter S25

---

## Regler

- Kör `npm test -- --run` efter varje commit. Avbryt vid regression eller fel test-antal.
- Step 0.1 preflight ska vara verifierad INNAN commit 1 startas.
- Assertioner via `data-value` (numeriskt) framför `byKr()` (formaterat) i B5-tester.
- Backend-tester via publik API (saveDraft→getDraft), inte privat processLines.
- Paritets-test inline:ar renderer-formeln istället för att rendera via jsdom.
- Commit-ordning: 1→2→3→4. Inget commit får skippa.
- Vid avvikelse mellan prompt och faktisk kod: stoppa, verifiera, uppdatera.
