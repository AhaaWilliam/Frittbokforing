#!/usr/bin/env bash
# M131-efterlevnad: flagga qty*price_kr utan Math.round-wrapping
# Kör: npm run check:m131
# Exit 0 = OK, Exit 1 = M131-brott hittat
#
# Begränsningar (medvetet enkel):
# - Lager 1: bar multiplikation "quantity * price_kr" eller "price_kr * quantity"
# - Lager 2: toOre/toKr-wrapping av multiplikationsuttryck
# - Fångar INTE aliasade variabler (const q = line.quantity; q * price_kr)
# - Fångar INTE multi-rad-uttryck
# - Fångar INTE andra monetära fält (amount * rate etc.)
# Ersätter inte code review; är defensiv backup för team av storlek 1.

set -euo pipefail

found=0

# Lager 1: bar multiplikation utan Math.round på samma rad
# Använder price_kr (inte price) för att undvika false positive på unit_price_ore (int × int, M92)
layer1=$(grep -rEn "quantity[^*]*\*[^*]*price_kr|price_kr[^*]*\*[^*]*quantity" src/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v "Math.round" | \
  grep -v ".test." | \
  grep -v node_modules || true)

# Lager 2: toOre/toKr-wrapping av multiplikation
layer2=$(grep -rEn "toOre\([^)]*\*[^)]*\)|toKr\([^)]*\*[^)]*\)" src/ \
  --include="*.ts" --include="*.tsx" 2>/dev/null | \
  grep -v ".test." | \
  grep -v node_modules || true)

if [ -n "$layer1" ]; then
  echo "❌ M131-brott (Lager 1 — bar multiplikation utan Math.round):"
  echo ""
  echo "$layer1"
  echo ""
  found=1
fi

if [ -n "$layer2" ]; then
  echo "❌ M131-brott (Lager 2 — toOre/toKr runt multiplikation):"
  echo ""
  echo "$layer2"
  echo ""
  found=1
fi

if [ $found -eq 1 ]; then
  echo "Se CLAUDE.md sektion 36 (M131) för korrekt formel."
  echo "Alt B: Math.round(Math.round(a*100) * Math.round(b*100) / 100)"
  exit 1
fi

echo "✅ M131-efterlevnad OK"
exit 0
