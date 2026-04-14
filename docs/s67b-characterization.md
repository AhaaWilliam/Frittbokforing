# F44 Float-precision karakterisering

## Metod
Brute-force-scan av (qty, price_kr)-kombinationer i domänen
qty ∈ [0.01, 5.00] (steg 0.01), price_kr ∈ [0.01, 200.00] (steg 0.01),
jämfört mot BigInt-heltalsreferens.

Reproducerbart via `node scripts/characterize-totals.mjs`.

## Resultat (körning: 2026-04-14)

| Formel | Felfrekvens | Max delta | Fel-fall |
|---|---|---|---|
| Gammal: `Math.round(qty * price_kr * 100)` | 0.346% | ±1 öre | 34 591 |
| Alt A: `Math.round(qty * toOre(price_kr))` | 0.089% | ±1 öre | 8 860 |
| **Alt B: heltalsaritmetik** | **0%** | **0** | **0** |

10 000 000 kombinationer totalt.

## Alt B-formel

```ts
const netOre = Math.round(Math.round(qty * 100) * Math.round(price_kr * 100) / 100)
```

## Alt B-invariant

`qty` måste ha ≤2 decimaler. Låses via Zod-refine i invoice-schema.
Expense redan låst via `z.number().int()`.

## Rotorsak

IEEE 754 inexakthet vid float-multiplikation. Exempel:
- `1.5 * 99.99` i IEEE 754 = `149.98499...998` (inte 149.985)
- `* 100` → `14998.499...` → `Math.round` = 14998 (FEL, ska vara 14999)

Alt B kringgår genom att konvertera båda operanderna till heltalsrepresentationer
(hundradels-qty × öre-price) innan multiplikation, sedan dividera tillbaka.

## Go-beslut

Alt B vald. Noll fel inom definierad domän. Samma komplexitet som Alt A
men utan kvarvarande ±1 öre-fall.

## Divergens-kandidater för B2.5

Scriptets utdata listar alla (qty, price_kr) där gammal formel ≠ Alt B.
34 591 divergens-fall totalt.

Spikat B2.5: qty=0.5, price_kr=64.99
- Gammal: `Math.round(0.5 * 64.99 * 100)` = `Math.round(3249.4999...)` = 3249
- Alt B: `Math.round(Math.round(50) * Math.round(6499) / 100)` = `Math.round(3249.5)` = 3250
- Referens: 3250

## B2.4-konsekvenser

- InvoiceTotals B2.4 (1.5 × 99.99): net 14998 → 14999, total 18748 → 18749
- ExpenseTotals B2.4 (1.5 × 100.33): oförändrad (båda formler ger 15050)
- ExpenseTotals B2.4 kvarstår som defensivt test (qty=1.5 inte produktionsmöjligt
  pga z.number().int(), men fångar regressioner om Zod-invarianten bryts)
