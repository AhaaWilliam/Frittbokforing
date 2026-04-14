# S66b — Karakterisering av beteendedelta (ExpenseTotals refaktor)

## Bakgrund

ExpenseForm hade inline `useMemo`-totals som ackumulerade i KR och körde
`toOre()` en gång på totalen. ExpenseTotals konvergerar till
InvoiceTotals-mönstret: `toOre(qty * price_kr)` per rad, sedan ackumulera
i öre.

## 0.8b — Delta-tabell

```
scenario    old_net  new_net  Δnet  old_vat  new_vat  Δvat  old_tot  new_tot  Δtot
jämn        125000   125000   0     31250    31250    0     156250   156250   0
decimal x2  24690    24690    0     6173     6173     0     30863    30863    0
edge öre    99       99       0     25       25       0     124      124      0
3x öre      297      297      0     74       75       1     371      372      1
fraktionell 15050    15050    0     3762     3763     1     18812    18813    1
blandade    24794    24794    0     3609     3609     0     28403    28403    0
stor        1000000  1000000  0     250000   250000  0     1250000  1250000  0
```

## Tolkning

- **Netto-delta: 0 i alla scenarier.** `toOre(qty * price_kr)` per rad ger
  identiskt netto oavsett ackumuleringsordning.
- **VAT-delta: max 1 öre**, förekommer i 2 av 7 scenarier ('3x öre' och
  'fraktionell'). Orsak: per-rad `Math.round(netOre * vat_rate)` ger
  upprundning per rad, medan total-avrundning ger nedrundning.
- **Total-delta: max 1 öre**, direkt konsekvens av VAT-delta.

## Konsekvens för existerande drafts

Befintliga drafts i databasen lagrar `unit_price_ore` (öre), inte kronor.
Edit-mode konverterar tillbaka till kr via `toKr()` och beräknar totals med
nya per-rad-mönstret. En draft sparad med gamla mönstret kan visa 1 öre
avvikelse i VAT-total vid re-render. Denna avvikelse är:

1. Inom normal avrundningstolerens (1 öre)
2. Bara synlig i preview (totals renderas, lagras aldrig)
3. Konsistent med InvoiceTotals-beteende (samma mönster sedan S66a)

## Go/no-go

**Go.** Max delta ≤ 1 öre per scenario. Nya mönstret är korrektare
(per-rad-avrundning matchar bokföringspraxis) och konvergerar med
InvoiceTotals.
