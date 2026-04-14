// Brute-force scan av (qty, price_kr)-kombinationer för F44-karakterisering.
// Jämför tre formler mot heltalsreferens.
//
// Kör: node scripts/characterize-totals.mjs

const formulas = {
  old:  (qty, price_kr) => Math.round(qty * price_kr * 100),
  altA: (qty, price_kr) => Math.round(qty * Math.round(price_kr * 100)),
  altB: (qty, price_kr) => Math.round(
    Math.round(qty * 100) * Math.round(price_kr * 100) / 100
  ),
}

// Heltalsreferens via BigInt: exakt qty_hundredths * price_ore / 100
const reference = (qty, price_kr) => {
  const qtyH = BigInt(Math.round(qty * 100))
  const priceO = BigInt(Math.round(price_kr * 100))
  const product = qtyH * priceO
  // Avrundning via BigInt: (product + 50) / 100 för halv-upp-avrundning
  const rounded = (product + 50n) / 100n
  return Number(rounded)
}

const results = { old: [], altA: [], altB: [] }
const divergencesOldVsAltB = []

// Scan-domän: qty 0.01-5.00 (steg 0.01), price_kr 0.01-200.00 (steg 0.01)
let total = 0
for (let qtyH = 1; qtyH <= 500; qtyH++) {
  const qty = qtyH / 100
  for (let priceH = 1; priceH <= 20000; priceH++) {
    const price_kr = priceH / 100
    const ref = reference(qty, price_kr)
    total++
    for (const [name, fn] of Object.entries(formulas)) {
      const val = fn(qty, price_kr)
      if (val !== ref) {
        results[name].push({ qty, price_kr, got: val, ref, delta: val - ref })
      }
    }
    // Samla divergenser gammal vs Alt B för B2.5-val
    if (formulas.old(qty, price_kr) !== formulas.altB(qty, price_kr)) {
      divergencesOldVsAltB.push({ qty, price_kr })
    }
  }
}

console.log(`Scan domän: ${total} kombinationer`)
for (const [name, errs] of Object.entries(results)) {
  const pct = ((errs.length / total) * 100).toFixed(3)
  console.log(`${name}: ${errs.length} fel (${pct}%)`)
  if (errs.length > 0 && errs.length <= 5) console.log('  exempel:', errs.slice(0, 3))
}

console.log(`\nDivergens gammal <-> Alt B: ${divergencesOldVsAltB.length} fall`)
console.log('Första 5 kandidater för B2.5:')
for (const d of divergencesOldVsAltB.slice(0, 5)) {
  const oldVal = formulas.old(d.qty, d.price_kr)
  const altBVal = formulas.altB(d.qty, d.price_kr)
  const refVal = reference(d.qty, d.price_kr)
  console.log(`  qty=${d.qty}, price_kr=${d.price_kr} → old=${oldVal}, altB=${altBVal}, ref=${refVal}`)
}

// Filtrera realistiska B2.5-kandidater (qty <= 3, price_kr 10-200, != B2.4-värden)
const realistic = divergencesOldVsAltB.filter(d =>
  d.qty <= 3 && d.price_kr >= 10 && d.price_kr <= 200 &&
  !(d.qty === 1.5 && d.price_kr === 99.99) // Inte B2.4
)
console.log(`\nRealistiska B2.5-kandidater (exkl. B2.4): ${realistic.length}`)
console.log('Första 5:')
for (const d of realistic.slice(0, 5)) {
  const oldVal = formulas.old(d.qty, d.price_kr)
  const altBVal = formulas.altB(d.qty, d.price_kr)
  const refVal = reference(d.qty, d.price_kr)
  console.log(`  qty=${d.qty}, price_kr=${d.price_kr} → old=${oldVal}, altB=${altBVal}, ref=${refVal}`)
}
