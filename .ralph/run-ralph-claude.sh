#!/usr/bin/env bash
# Ralph Wiggum loop for skill-audit — TIME-BOUNDED edition.
# Runs until MAX_HOURS (or MAX_MINUTES) of wall-clock time has elapsed.
# Checks budget at the top of each iteration. Never kills mid-iteration.
#
# Refs:
#   - Geoffrey Huntley "Ralph Wiggum as a software engineer" (ghuntley.com/ralph)
#   - HumanLayer "A Brief History of Ralph" — prefer bash loop over stop-hook plugin
#
# Usage:
#   MAX_HOURS=8 ./.ralph/run-ralph-claude.sh              # run for ~8 hours
#   MAX_HOURS=3.5 ./.ralph/run-ralph-claude.sh            # fractional OK
#   MAX_MINUTES=420 ./.ralph/run-ralph-claude.sh          # same as MAX_HOURS=7
#   MAX_HOURS=8 DRY_RUN=1 ./.ralph/run-ralph-claude.sh    # preview without calling claude

set -uo pipefail

RALPH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$RALPH_DIR/.." && pwd)"
PROMPT_FILE="$RALPH_DIR/PROMPT.md"
FIX_PLAN_FILE="$RALPH_DIR/fix_plan.md"
cd "$REPO_ROOT"

# --- Config ---------------------------------------------------------------
MAX_HOURS="${MAX_HOURS:-}"                   # primary budget (decimal OK)
MAX_MINUTES="${MAX_MINUTES:-}"               # alternative finer-grained
MAX_ITERATIONS="${MAX_ITERATIONS:-1000}"     # hard safety cap, not primary limit
SLEEP_BETWEEN="${SLEEP_BETWEEN:-5}"
CLAUDE_ARGS="${CLAUDE_ARGS:---dangerously-skip-permissions}"
LOG_DIR="${LOG_DIR:-$RALPH_DIR/logs}"
LOG_FILE="${LOG_DIR}/ralph.log"
DONE_MARKER="ALL TASKS COMPLETE"

# --- Compute budget in seconds -------------------------------------------
BUDGET_SECONDS=0
if [[ -n "$MAX_HOURS" ]]; then
  # awk handles fractional hours safely (bash can't do float math)
  BUDGET_SECONDS=$(awk "BEGIN { printf \"%d\", $MAX_HOURS * 3600 }")
elif [[ -n "$MAX_MINUTES" ]]; then
  BUDGET_SECONDS=$(( MAX_MINUTES * 60 ))
fi

if (( BUDGET_SECONDS <= 0 )); then
  cat <<EOF
❌ Must set MAX_HOURS or MAX_MINUTES.

Examples:
  MAX_HOURS=8 ./.ralph/run-ralph-claude.sh          # run for 8 hours
  MAX_HOURS=3.5 ./.ralph/run-ralph-claude.sh        # fractional OK
  MAX_MINUTES=420 ./.ralph/run-ralph-claude.sh      # 7 hours in minutes

The loop exits cleanly between iterations once the budget is exhausted;
it will NOT kill a running iteration mid-flight.
EOF
  exit 1
fi

# --- Pre-flight checks ----------------------------------------------------
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "⚠️  ANTHROPIC_API_KEY is set."
  echo "   Claude Code will bill through the API, NOT your subscription."
  echo "   If this is not what you want, run:  unset ANTHROPIC_API_KEY"
  read -r -p "Continue anyway? [y/N] " yn
  [[ "$yn" != "y" && "$yn" != "Y" ]] && exit 1
fi

command -v claude >/dev/null || { echo "❌ claude CLI not on PATH"; exit 1; }
[[ -f "$PROMPT_FILE" ]]   || { echo "❌ $PROMPT_FILE not found"; exit 1; }
[[ -f "$FIX_PLAN_FILE" ]] || { echo "❌ $FIX_PLAN_FILE not found"; exit 1; }

mkdir -p "$LOG_DIR"

# --- Helpers --------------------------------------------------------------
human_duration() {
  local total=$1
  local h=$(( total / 3600 ))
  local m=$(( (total % 3600) / 60 ))
  printf "%dh %02dm" "$h" "$m"
}

# Cross-platform 'format an epoch second as local time'
fmt_epoch() {
  local epoch=$1
  # BSD date (macOS) vs GNU date (Linux) — try both
  date -r "$epoch" '+%H:%M:%S %Z' 2>/dev/null \
    || date -d "@$epoch" '+%H:%M:%S %Z' 2>/dev/null \
    || echo "$epoch"
}

# --- Loop -----------------------------------------------------------------
START_TIME=$(date +%s)
END_TIME=$(( START_TIME + BUDGET_SECONDS ))
WARN_TIME=$(( START_TIME + BUDGET_SECONDS * 3 / 4 ))   # 75% warning
warned=0

echo "🔁 Ralph starting — time-bounded run"
echo "   Budget:         $(human_duration "$BUDGET_SECONDS")"
echo "   Will stop by:   $(fmt_epoch "$END_TIME")"
echo "   Iteration cap:  $MAX_ITERATIONS (safety backstop only)"
echo "   Log:            $LOG_FILE"
echo "   Stop early:     Ctrl-C (or pkill -f run-ralph-claude.sh from another terminal)"
echo ""

iter=0
while true; do
  now=$(date +%s)
  elapsed=$(( now - START_TIME ))
  remaining=$(( END_TIME - now ))

  # --- Budget exhausted? Exit cleanly before starting another iteration.
  if (( now >= END_TIME )); then
    echo "⏰ [$(date -u +%FT%TZ)] Budget exhausted after $(human_duration "$elapsed")."
    echo "   Last completed iteration: $iter. Exiting cleanly."
    exit 0
  fi

  # --- Iteration hard cap (safety)
  iter=$(( iter + 1 ))
  if (( iter > MAX_ITERATIONS )); then
    echo "🏁 Iteration hard cap ($MAX_ITERATIONS) reached after $(human_duration "$elapsed"). Exiting."
    exit 0
  fi

  # --- 75% warning, once
  if (( warned == 0 && now >= WARN_TIME )); then
    echo "⚠️  75% of budget consumed ($(human_duration "$elapsed") / $(human_duration "$BUDGET_SECONDS")). $(human_duration "$remaining") remaining."
    warned=1
  fi

  # --- All tasks done?
  if grep -qE "^[[:space:]]*${DONE_MARKER}[[:space:]]*\$" "$FIX_PLAN_FILE"; then
    echo "✅ [$(date -u +%FT%TZ)] .ralph/fix_plan.md contains '$DONE_MARKER'."
    echo "   Finished in $(human_duration "$elapsed") after $((iter-1)) iterations. Exiting."
    exit 0
  fi
  if ! grep -qE '^\s*-\s*\[\s\]' "$FIX_PLAN_FILE"; then
    echo "✅ No unchecked tasks remain. Finished in $(human_duration "$elapsed"). Exiting."
    exit 0
  fi

  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "── iter $iter @ $ts · elapsed $(human_duration "$elapsed") / remaining $(human_duration "$remaining") ──" \
    | tee -a "$LOG_FILE"

  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "(DRY_RUN) would invoke: cat .ralph/PROMPT.md | claude -p $CLAUDE_ARGS" | tee -a "$LOG_FILE"
    sleep 2
  else
    if ! cat "$PROMPT_FILE" | claude -p $CLAUDE_ARGS 2>&1 | tee -a "$LOG_FILE"; then
      echo "⚠️  [$ts] claude exited non-zero on iter $iter. Continuing." | tee -a "$LOG_FILE"
    fi
  fi

  # --- Commit straggler changes Ralph forgot to commit (defensive)
  if [[ "${DRY_RUN:-0}" != "1" ]] && { ! git diff --quiet || ! git diff --cached --quiet; }; then
    git add -A && git commit -m "ralph: iter ${iter} stragglers" >> "$LOG_FILE" 2>&1 || true
  fi

  sleep "$SLEEP_BETWEEN"
done
