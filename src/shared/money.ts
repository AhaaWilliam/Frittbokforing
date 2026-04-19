/**
 * Monetära beräkningar (M131) — enda tillåtna platsen för multiplikation
 * som involverar `_kr`-identifierare.
 *
 * Bakgrund: native `qty * price_kr` i JavaScript utsätts för IEEE 754-
 * precision-fel (t.ex. `0.29 * 50 = 14.499…`). Formeln nedan använder
 * heltalsaritmetik via öre-konvertering och ger 0% fel i karakteriserings-
 * domän (qty ∈ [0.01, 5.00], price ∈ [0.01, 200.00]) — se
 * `docs/s67b-characterization.md`.
 *
 * Invariant: båda operander har ≤2 decimalers precision. Tvingas via
 * Zod-refine i form- och IPC-scheman (se M131 + M132).
 *
 * Vid vidareutveckling: all ny monetär multiplikation med `_kr`-operander
 * ska gå via denna modul. Enforcement: `scripts/check-m131-ast.mjs`
 * flaggar binär `*` på `_kr`-identifier utanför denna fil.
 */

/**
 * Multiplicera kvantitet (decimal) med pris i kronor (decimal).
 * Returnerar belopp i öre (heltal).
 *
 * Formel (M131): Math.round(Math.round(qty*100) * Math.round(priceKr*100) / 100)
 */
export function multiplyKrToOre(qtyDecimal: number, priceKr: number): number {
  return Math.round(
    (Math.round(qtyDecimal * 100) * Math.round(priceKr * 100)) / 100,
  )
}

/**
 * Parsa ett decimaltal från en sträng med svensk ELLER engelsk formatering.
 * Returnerar `NaN` om strängen inte kan tolkas.
 *
 * Konverterar komma till punkt innan `parseFloat` — `"99,50"` → `99.5`.
 * Svenska användare skriver decimaltal med komma; `parseFloat` utan
 * konvertering tolkar `"99,50"` som `99` och tappar decimalerna tyst,
 * vilket skapar produktionsbuggar i fakturering och betalning (F68).
 *
 * Whitespace hanteras via parseFloat (skipprar leading + stoppar vid
 * trailing). Tom sträng → `NaN` (parseFloat default — callsiten
 * bestämmer hur tomt ska hanteras).
 */
export function parseDecimal(value: string): number {
  return parseFloat(value.replace(',', '.'))
}

/**
 * Multiplicera kvantitet (decimal) med pris som redan är i öre (heltal).
 * Returnerar belopp i öre (heltal).
 *
 * Används när priset redan är normaliserat till öre i datalagret
 * (t.ex. `unit_price_ore` från DB). qty kan fortfarande vara fraktionell
 * (invoice-lines quantity REAL — M130).
 */
export function multiplyDecimalByOre(
  qtyDecimal: number,
  priceOre: number,
): number {
  return Math.round((Math.round(qtyDecimal * 100) * priceOre) / 100)
}
