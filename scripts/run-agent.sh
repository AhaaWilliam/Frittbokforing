#!/bin/bash
# scripts/run-agent.sh
# Autonomt agent-skript som kör Claude Code headless mot Fritt Bokföring.
# Placeras i repo/scripts/. Kör: ./scripts/run-agent.sh "din task här"

set -u  # Crash på unset variables

# ─── Konfiguration ────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LOCK_FILE="$REPO_ROOT/.agent.lock"
LOG_DIR="$REPO_ROOT/.agent-logs"
mkdir -p "$LOG_DIR"

# Konfigurerbart via env
MAX_TURNS="${AGENT_MAX_TURNS:-60}"
MAX_BUDGET="${AGENT_MAX_BUDGET_USD:-}"      # Tom = ingen USD-cap (meningsfullt mest för API-användare)
MODEL="${AGENT_MODEL:-}"                    # Tom = default (Opus på Max, Sonnet på Pro)

# ─── Validering ───────────────────────────────────────────────────────────────

TASK="${1:-}"
if [ -z "$TASK" ]; then
  cat <<EOF
Usage: $0 "<task description>"

Miljövariabler:
  AGENT_MAX_TURNS        Max agentic turns (default: 60)
  AGENT_MAX_BUDGET_USD   Kostnadstak i USD — OBS: främst för API-användare.
                         På Max-prenumeration är detta inte meningsfullt
                         (flat-rate med token-baserade rate limits).
                         Lämna tom för att skippa flaggan.
  AGENT_MODEL            claude-opus-4-7 | claude-sonnet-4-6 | claude-haiku-4-5

Exempel:
  $0 "Implementera budget:getSummaryByYear enligt befintligt mönster"
  AGENT_MODEL=claude-sonnet-4-6 $0 "Liten fix i expense-service"
EOF
  exit 1
fi

if ! command -v claude &> /dev/null; then
  echo "❌ claude CLI saknas. Installera med: npm install -g @anthropic-ai/claude-code"
  exit 1
fi

# Är vi i ett git-repo?
if ! git rev-parse --git-dir &> /dev/null; then
  echo "❌ Inte i ett git-repo. Agenten kräver git för commit-workflow."
  exit 1
fi

# Finns CLAUDE.md?
if [ ! -f "$REPO_ROOT/CLAUDE.md" ]; then
  echo "⚠️  CLAUDE.md saknas i $REPO_ROOT — agenten kan inte följa M-principerna."
  read -p "Fortsätta ändå? [y/N] " -n 1 -r
  echo
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# ─── Lockfile ─────────────────────────────────────────────────────────────────

if [ -f "$LOCK_FILE" ]; then
  EXISTING_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "unknown")
  if ps -p "$EXISTING_PID" > /dev/null 2>&1; then
    echo "❌ Agent körs redan (PID $EXISTING_PID). Vänta eller: kill $EXISTING_PID"
    exit 1
  else
    echo "🧹 Gammal lockfile från död process — rensar."
    rm -f "$LOCK_FILE"
  fi
fi

echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ─── Git state före ───────────────────────────────────────────────────────────

BRANCH=$(git rev-parse --abbrev-ref HEAD)
START_SHA=$(git rev-parse HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/$TIMESTAMP.log"

# Varna om uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "⚠️  Du har uncommitted changes. Agenten kommer inkludera dessa i arbetet."
  read -p "Fortsätta? [y/N] " -n 1 -r
  echo
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
fi

# ─── Bygg prompten ────────────────────────────────────────────────────────────

WORKFLOW_PROMPT="TASK: $TASK

Följ CLAUDE.md strikt (auto-laddad i projektroten). Läs den FÖRST om du inte redan gjort det.

WORKFLOW:
1. Innan du skriver ny kod: läs minst 2 liknande befintliga filer för att verifiera mönster.
   Gissa aldrig på konventioner — verifiera mot faktisk kod.
2. Kör 'npm run test:agent' efter varje meningsfull förändring.
3. När en deluppgift är klar och grön: 'git add' + 'git commit -m \"feat: ...\"' eller 'fix: ...'
   INNAN du går vidare till nästa del. Aldrig monolitisk slutcommit.
4. Stopp-villkor: om samma fel kvarstår efter 3 försök → sluta, beskriv vad du testat.
5. Klart = alla tester gröna + alla commits gjorda + 2-3 raders sammanfattning.

FÖRBJUDET:
- Kör ALDRIG 'npx playwright test' — E2E verifieras manuellt av utvecklaren.
- 'new Date()' i services → använd getNow() eller todayLocalFromNow() från src/main/utils/now.ts.
- 'throw new Error(...)' i services → använd strukturerade fel { code, error, field? }.
- Lexikografiska kontojämförelser (account_number >= '3000') → använd matchesRanges() eller CAST (M98).
- Direkt better-sqlite3 i E2E-tester → seeda via IPC (M148).

Börja nu."

# ─── Kör Claude Code ──────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════"
echo "  Claude Code Agent — Fritt Bokföring"
echo "═══════════════════════════════════════════════════════"
echo "  Branch:  $BRANCH"
echo "  Start:   ${START_SHA:0:7}"
echo "  Model:   ${MODEL:-default}"
echo "  Turns:   max $MAX_TURNS"
if [ -n "$MAX_BUDGET" ]; then
  echo "  Budget:  max \$$MAX_BUDGET"
else
  echo "  Budget:  (ingen USD-cap — Max-prenumeration använder token-limits)"
fi
echo "  Log:     $LOG_FILE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "📋 Task: $TASK"
echo ""
echo "▶️  Startar agent..."
echo ""

CLAUDE_ARGS=(
  --print
  --dangerously-skip-permissions
  --max-turns "$MAX_TURNS"
)

if [ -n "$MAX_BUDGET" ]; then
  CLAUDE_ARGS+=(--max-budget-usd "$MAX_BUDGET")
fi

if [ -n "$MODEL" ]; then
  CLAUDE_ARGS+=(--model "$MODEL")
fi

# Kör + streama till både terminal och logfil
claude "${CLAUDE_ARGS[@]}" "$WORKFLOW_PROMPT" 2>&1 | tee "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}

# ─── Sammanfattning ───────────────────────────────────────────────────────────

END_SHA=$(git rev-parse HEAD)
echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "  ✅ Agent klar (exit 0)"
else
  echo "  ⚠️  Agent avslutades med exit $EXIT_CODE"
fi
echo "═══════════════════════════════════════════════════════"

if [ "$START_SHA" != "$END_SHA" ]; then
  echo "  Nya commits:"
  git log --oneline "$START_SHA..$END_SHA" | sed 's/^/    /'
  echo ""
  echo "  Filer ändrade:"
  git diff --stat "$START_SHA..$END_SHA" | sed 's/^/    /'
else
  echo "  ⚠️  Inga nya commits skapade."
fi

echo ""
echo "  Logg: $LOG_FILE"
echo ""

exit $EXIT_CODE
