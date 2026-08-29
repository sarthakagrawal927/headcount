#!/usr/bin/env bash
#
# Bring the whole demo up in one command.
#
#   ./scripts/stack.sh            start everything not already running
#   ./scripts/stack.sh --fresh    restart the game server too, so the floor
#                                 starts empty (do this before recording)
#
# Ports: 8790 harness · 3001 game/MCP · 3002 model shim · 5173 console
set -uo pipefail
cd "$(dirname "$0")/.."

LOG_DIR="${LOG_DIR:-.headcount/logs}"
mkdir -p "$LOG_DIR"

up() { curl -s --max-time 2 "http://localhost:$1" >/dev/null 2>&1; }

start() { # name port healthpath command...
  local name=$1 port=$2 path=$3; shift 3
  if up "$port$path"; then
    echo "  $name already up on :$port"
    return
  fi
  echo "  starting $name on :$port"
  nohup "$@" > "$LOG_DIR/$name.log" 2>&1 &
  for _ in $(seq 1 40); do
    up "$port$path" && { echo "    ready"; return; }
    sleep 0.5
  done
  echo "    FAILED — see $LOG_DIR/$name.log"
}

if [[ "${1:-}" == "--fresh" ]]; then
  echo "restarting the game server so the floor starts empty"
  pkill -f "tsx src/mcp/server.ts" 2>/dev/null
  sleep 1
  FRESH=1
fi

echo "HEADCOUNT stack"

start harness 8790 /api/v1/capabilities npx @truefoundry/trueforge@latest --port 8790

# The shim is only needed for the free multi-provider gateway. With a real
# provider key, point MODEL_FQN at it directly and skip this entirely.
if [[ -n "${GATEWAY_KEY:-}" ]]; then
  start shim 3002 /v1/models npx tsx src/gateway/proxy.ts
else
  echo "  shim skipped (no GATEWAY_KEY — expected if using a real provider)"
fi

# --fresh means a demo is about to be recorded, and the opening beat of the
# genre is being the only person on the line. Without this the company plays
# itself and you are never alone on the floor.
if [[ "${FRESH:-}" == "1" ]]; then
  HEADCOUNT_AUTOPLAY=0 start game 3001 /health npx tsx src/mcp/server.ts
else
  start game 3001 /health npx tsx src/mcp/server.ts
fi
start console 5173 "" npx vite --port 5173 --strictPort

echo
echo "  console   http://localhost:5173"
echo "  harness   http://localhost:8790"
echo
echo "  next: MODEL_FQN=<provider/model> npx tsx src/agent/provision.ts"
echo "        npx tsx src/agent/autonomy.ts        # the supervisor"
echo "        npx tsx src/agent/demo.ts --approve  # one design round"
