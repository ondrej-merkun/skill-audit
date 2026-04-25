#!/usr/bin/env bash
# Ralph Wiggum loop for skillaudit — CODEX edition, time-bounded.
# Mirror of scripts/run-ralph.sh but invokes Codex CLI instead of Claude.
# Runs until MAX_HOURS (or MAX_MINUTES) of wall-clock time has elapsed.
# Checks budget at the top of each iteration. Never kills mid-iteration.
#
# Refs:
#   - Geoffrey Huntley "Ralph Wiggum as a software engineer" (ghuntley.com/ralph)
#   - HumanLayer "A Brief History of Ralph"
#
# Usage:
#   MAX_HOURS=8 ./scripts/run-ralph-codex.sh             # run for ~8 hours
#   MAX_HOURS=3.5 ./scripts/run-ralph-codex.sh           # fractional OK
#   MAX_MINUTES=420 ./scripts/run-ralph-codex.sh         # same as MAX_HOURS=7
#   MAX_HOURS=8 DRY_RUN=1 ./scripts/run-ralph-codex.sh   # preview without calling codex
#   CODEX_MODEL=gpt-5-codex MAX_HOURS=4 ./scripts/run-ralph-codex.sh
#
# Differences from run-ralph.sh (Claude version):
#   - Invokes `codex exec` instead of `claude -p`
#   - Uses --full-auto (= --ask-for-approval never + --sandbox workspace-write)
#     instead of Claude's --dangerously-skip-permissions
#   - Pre-flight checks for OPENAI_API_KEY (or codex login) instead of
#     ANTHROPIC_API_KEY
#   - Reads PROMPT.md via stdin redirection (avoids ARG_MAX on long prompts)
#   - Sets NO_COLOR=1 inside the loop so logs don't accumulate ANSI cruft
#   - CODEX_MODEL env var lets operator pin the model

set -uo pipefail

# --- Config ---------------------------------------------------------------
MAX_HOURS="${MAX_HOURS:-}"                   # primary budget (decimal OK)
MAX_MINUTES="${MAX_MINUTES:-}"               # alternative finer-grained
MAX_ITERATIONS="${MAX_ITERATIONS:-1000}"     # hard safety cap, not primary limit
SLEEP_BETWEEN="${SLEEP_BETWEEN:-5}"
CODEX_MODEL="${CODEX_MODEL:-}"               # optional model pin (e.g. gpt-5-codex)
CODEX_ARGS="${CODEX_ARGS:---full-auto --skip-git-repo-check}"
LOG_DIR="${LOG_DIR:-logs}"
LOG_FILE="${LOG_DIR}/ralph-codex.log"
DONE_MARKER="ALL TASKS COMPLETE"

# --- Compute budget in seconds -------------------------------------------
BUDGET_SECONDS=0
if [[ -n "$MAX_HOURS" ]]; then
  BUDGET_SECONDS=$(awk "BEGIN { printf \"%d\", $MAX_HOURS * 3600 }")
elif [[ -n "$MAX_MINUTES" ]]; then
  BUDGET_SECONDS=$(( MAX_MINUTES * 60 ))
fi

if (( BUDGET_SECONDS <= 0 )); then
  cat <<EOF
❌ Must set MAX_HOURS or MAX_MINUTES.

Examples:
  MAX_HOURS=8 ./scripts/run-ralph-codex.sh           # run for 8 hours
  MAX_HOURS=3.5 ./scripts/run-ralph-codex.sh         # fractional OK
  MAX_MINUTES=420 ./scripts/run-ralph-codex.sh       # 7 hours in minutes

The loop exits cleanly between iterations once the budget is exhausted;
it will NOT kill a running iteration mid-flight.
EOF
  exit 1
fi

# --- Pre-flight checks ----------------------------------------------------
# Codex auths via either OPENAI_API_KEY or `codex login` (stored token).
# We can't easily read the token store, so just nudge the user if neither
# the env var nor a likely login session is present.
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  if ! codex --version >/dev/null 2>&1; then
    echo "❌ codex CLI not on PATH"; exit 1
  fi
  if [[ ! -d "${HOME}/.codex" && ! -d "${HOME}/.config/codex" ]]; then
    echo "⚠️  No OPENAI_API_KEY set and no ~/.codex or ~/.config/codex found."
    echo "   Run 'codex login' first, or export OPENAI_API_KEY."
    read -r -p "Continue anyway? [y/N] " yn
    [[ "$yn" != "y" && "$yn" != "Y" ]] && exit 1
  fi
fi

command -v codex >/dev/null || { echo "❌ codex CLI not on PATH"; exit 1; }
[[ -f PROMPT.md ]]   || { echo "❌ PROMPT.md not found in $(pwd)"; exit 1; }
[[ -f fix_plan.md ]] || { echo "❌ fix_plan.md not found"; exit 1; }
[[ -f AGENTS.md ]]   || echo "⚠️  AGENTS.md missing — Codex won't auto-load instructions."

mkdir -p "$LOG_DIR"

# --- Helpers --------------------------------------------------------------
human_duration() {
  local total=$1
  local h=$(( total / 3600 ))
  local m=$(( (total % 3600) / 60 ))
  printf "%dh %02dm" "$h" "$m"
}

fmt_epoch() {
  local epoch=$1
  date -r "$epoch" '+%H:%M:%S %Z' 2>/dev/null \
    || date -d "@$epoch" '+%H:%M:%S %Z' 2>/dev/null \
    || echo "$epoch"
}

# --- Loop -----------------------------------------------------------------
START_TIME=$(date +%s)
END_TIME=$(( START_TIME + BUDGET_SECONDS ))
WARN_TIME=$(( START_TIME + BUDGET_SECONDS * 3 / 4 ))   # 75% warning
warned=0

echo "🔁 Ralph (Codex) starting — time-bounded run"
echo "   Budget:         $(human_duration "$BUDGET_SECONDS")"
echo "   Will stop by:   $(fmt_epoch "$END_TIME")"
echo "   Iteration cap:  $MAX_ITERATIONS (safety backstop only)"
echo "   Model:          ${CODEX_MODEL:-<codex default>}"
echo "   Codex args:     $CODEX_ARGS"
echo "   Log:            $LOG_FILE"
echo "   Stop early:     Ctrl-C (or pkill -f run-ralph-codex.sh from another terminal)"
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
  if grep -qE "^[[:space:]]*${DONE_MARKER}[[:space:]]*\$" fix_plan.md; then
    echo "✅ [$(date -u +%FT%TZ)] fix_plan.md contains '$DONE_MARKER'."
    echo "   Finished in $(human_duration "$elapsed") after $((iter-1)) iterations. Exiting."
    exit 0
  fi
  if ! grep -qE '^\s*-\s*\[\s\]' fix_plan.md; then
    echo "✅ No unchecked tasks remain. Finished in $(human_duration "$elapsed"). Exiting."
    exit 0
  fi

  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "── iter $iter @ $ts · elapsed $(human_duration "$elapsed") / remaining $(human_duration "$remaining") ──" \
    | tee -a "$LOG_FILE"

  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "(DRY_RUN) would invoke: codex exec $CODEX_ARGS ${CODEX_MODEL:+--model $CODEX_MODEL} < PROMPT.md" \
      | tee -a "$LOG_FILE"
    sleep 2
  else
    # NO_COLOR keeps the log file free of ANSI escapes when codex
    # auto-detects a TTY parent through `tee`.
    if ! NO_COLOR=1 codex exec $CODEX_ARGS ${CODEX_MODEL:+--model "$CODEX_MODEL"} < PROMPT.md 2>&1 \
        | tee -a "$LOG_FILE"; then
      echo "⚠️  [$ts] codex exited non-zero on iter $iter. Continuing." | tee -a "$LOG_FILE"
    fi
  fi

  # --- Commit straggler changes the iteration forgot to commit (defensive)
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git add -A && git commit -m "ralph-codex: iter ${iter} stragglers" >> "$LOG_FILE" 2>&1 || true
  fi

  sleep "$SLEEP_BETWEEN"
done
