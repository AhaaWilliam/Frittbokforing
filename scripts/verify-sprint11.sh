#!/bin/bash
# Sprint 11 - Verifikation av rapportavvikelser
# Commit: ddb032c

set -u
COMMIT="ddb032c"

echo "═══════════════════════════════════════════════════════════"
echo "  SPRINT 11 VERIFIKATION — commit $COMMIT"
echo "═══════════════════════════════════════════════════════════"
echo

# ─────────────────────────────────────────────────────────────
# 1. Filräkning: 36 vs 26
# ─────────────────────────────────────────────────────────────
echo "▸ 1. FILRÄKNING (rapport: 36, förväntat: 26)"
echo "───────────────────────────────────────────────────────────"
git show --stat "$COMMIT" | tail -1
echo
TOTAL=$(git show --name-only --format="" "$COMMIT" | grep -c .)
SRC=$(git show --name-only --format="" "$COMMIT" | grep -v -E '(^tests/|\.test\.ts$|\.spec\.ts$)' | grep -c .)
TEST=$(git show --name-only --format="" "$COMMIT" | grep -E '(^tests/|\.test\.ts$|\.spec\.ts$)' | grep -c .)
echo "  Totalt:      $TOTAL"
echo "  Källfiler:   $SRC   (rapport: 6, prompt-spec: 5)"
echo "  Testfiler:   $TEST  (rapport: 19, prompt-spec: 4)"
echo "  Summa check: $((SRC + TEST)) = $TOTAL ?"
echo

# ─────────────────────────────────────────────────────────────
# 2. Migration komplett: inga kvarvarande debit_amount/credit_amount
# ─────────────────────────────────────────────────────────────
echo "▸ 2. MIGRATION — kvarvarande referenser i tests/"
echo "───────────────────────────────────────────────────────────"
HITS=$(grep -rn "debit_amount\|credit_amount" tests/ --include="*.ts" 2>/dev/null)
if [ -z "$HITS" ]; then
  echo "  ✓ 0 träffar — migrationen är komplett"
else
  COUNT=$(echo "$HITS" | wc -l | tr -d ' ')
  echo "  ✗ $COUNT träffar kvar:"
  echo "$HITS" | sed 's/^/    /'
fi
echo
echo "  (Info) Träffar i migration-historik (förväntat > 0):"
MIG=$(grep -rn "debit_amount\|credit_amount" src/main/database/migrations/ 2>/dev/null | wc -l | tr -d ' ')
echo "    $MIG träffar i migrations/"
echo

# ─────────────────────────────────────────────────────────────
# 3. Den 6:e källfilen — vilken är extra vs prompt-spec?
# ─────────────────────────────────────────────────────────────
echo "▸ 3. KÄLLFILER — identifiera den 6:e"
echo "───────────────────────────────────────────────────────────"
git show --name-only --format="" "$COMMIT" \
  | grep -v -E '(^tests/|\.test\.ts$|\.spec\.ts$)' \
  | grep -v '^$' \
  | sort \
  | sed 's/^/  /'
echo
echo "  Jämför mot prompt-specens 5 förväntade filer."
echo "  Den extra är antingen:"
echo "    (a) legitim upptäckt → Steg 0 grep-strategi har lucka"
echo "    (b) scope creep      → borde inte ha ändrats"
echo

echo "═══════════════════════════════════════════════════════════"
echo "  Klart. Klistra in output så tar vi retrospektiven."
echo "═══════════════════════════════════════════════════════════"
