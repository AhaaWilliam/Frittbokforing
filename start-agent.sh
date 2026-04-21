#!/bin/bash
# start-agent.sh — Startar OpenHands agent för Fritt Bokföring
# Placeras i repo-roten. Kör: chmod +x start-agent.sh && ./start-agent.sh

set -e

# ─── Konfiguration ────────────────────────────────────────────────────────────

# Sökväg till din repo (auto-detekteras till katalogen där skriptet ligger)
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Läs API-nyckel från miljövariabel eller .env-fil
if [ -z "$ANTHROPIC_API_KEY" ]; then
  if [ -f "$REPO_DIR/.env" ]; then
    export $(grep -v '^#' "$REPO_DIR/.env" | xargs)
  fi
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ ANTHROPIC_API_KEY saknas."
  echo "   Sätt den i .env-filen eller: export ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

MODEL="${OPENHANDS_MODEL:-anthropic/claude-sonnet-4-6}"
PORT="${OPENHANDS_PORT:-3000}"
CONTAINER_NAME="openhands-fritt"

# ─── Kontroller ───────────────────────────────────────────────────────────────

if ! command -v docker &> /dev/null; then
  echo "❌ Docker hittades inte. Installera Docker Desktop och försök igen."
  exit 1
fi

if ! docker info &> /dev/null; then
  echo "❌ Docker körs inte. Starta Docker Desktop och försök igen."
  exit 1
fi

# Stoppa eventuell gammal container med samma namn
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "🔄 Stoppar gammal container..."
  docker rm -f "$CONTAINER_NAME" &> /dev/null
fi

# ─── Starta OpenHands ─────────────────────────────────────────────────────────

echo ""
echo "🚀 Startar OpenHands..."
echo "   Repo:  $REPO_DIR"
echo "   Modell: $MODEL"
echo "   Port:  $PORT"
echo ""

docker run -d \
  --name "$CONTAINER_NAME" \
  -e LLM_API_KEY="$ANTHROPIC_API_KEY" \
  -e LLM_MODEL="$MODEL" \
  -e LLM_PROVIDER="anthropic" \
  -e FRITT_DB_PATH="/tmp/agent-test.db" \
  -v "$REPO_DIR":/workspace \
  -v openhands-fritt-node-modules:/workspace/node_modules \
  -p "$PORT":3000 \
  --dns 8.8.8.8 \
  docker.openhands.dev/all-hands-ai/openhands:latest

# ─── Vänta på att UI är redo ──────────────────────────────────────────────────

echo "⏳ Väntar på att OpenHands startar..."
for i in {1..30}; do
  if curl -s "http://localhost:$PORT" &> /dev/null; then
    echo ""
    echo "✅ OpenHands är igång!"
    echo ""
    echo "   👉 Öppna: http://localhost:$PORT"
    echo ""
    echo "   📋 Kom ihåg att klistra in System Prompt från:"
    echo "      docs/openhands-setup.md → Steg 3"
    echo ""
    echo "   🛑 Stoppa agenten: docker rm -f $CONTAINER_NAME"
    echo ""
    # Öppna webbläsaren automatiskt på macOS
    if command -v open &> /dev/null; then
      open "http://localhost:$PORT"
    fi
    exit 0
  fi
  sleep 2
done

echo "⚠️  OpenHands svarar inte på port $PORT efter 60s."
echo "   Kolla loggar: docker logs $CONTAINER_NAME"
exit 1
