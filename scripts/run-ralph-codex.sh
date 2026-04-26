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
#   - Adds --add-dir "$PWD/.git" because workspace-write keeps `.git` read-only
#     by default, which silently breaks the agent's `git commit` step and
#     forces every iteration through the straggler fallback. See LESSONS.md.
#   - Pre-flight checks for OPENAI_API_KEY (or codex login) instead of
#     ANTHROPIC_API_KEY
#   - Reads PROMPT.md via stdin redirection (avoids ARG_MAX on long prompts)
#   - Sets NO_COLOR=1 inside the loop so logs don't accumulate ANSI cruft
#   - CODEX_MODEL env var pins the model (default: gpt-5.5)
#   - CODEX_EFFORT env var sets reasoning effort (default: medium); passed
#     through as `-c model_reasoning_effort="$CODEX_EFFORT"`
#   - STRAGGLER_LIMIT env var bounds consecutive straggler-fallback commits;
#     the loop aborts when the agent is clearly stuck (default: 2)

set -uo pipefail

# --- Config ---------------------------------------------------------------
MAX_HOURS="${MAX_HOURS:-}"                   # primary budget (decimal OK)
MAX_MINUTES="${MAX_MINUTES:-}"               # alternative finer-grained
MAX_ITERATIONS="${MAX_ITERATIONS:-1000}"     # hard safety cap, not primary limit
SLEEP_BETWEEN="${SLEEP_BETWEEN:-5}"
CODEX_MODEL="${CODEX_MODEL:-gpt-5.5}"        # model pin (default: gpt-5.5)
CODEX_EFFORT="${CODEX_EFFORT:-medium}"       # reasoning effort (default: medium)
CODEX_ARGS="${CODEX_ARGS:---full-auto --skip-git-repo-check --add-dir $PWD/.git}"
STRAGGLER_LIMIT="${STRAGGLER_LIMIT:-2}"      # consecutive stragglers before aborting
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
echo "   Budget:          $(human_duration "$BUDGET_SECONDS")"
echo "   Will stop by:    $(fmt_epoch "$END_TIME")"
echo "   Iteration cap:   $MAX_ITERATIONS (safety backstop only)"
echo "   Model:           ${CODEX_MODEL:-<codex default>}"
echo "   Reasoning:       $CODEX_EFFORT"
echo "   Codex args:      $CODEX_ARGS"
echo "   Straggler limit: $STRAGGLER_LIMIT consecutive (then exit 2)"
echo "   Log:             $LOG_FILE"
echo "   Stop early:      Ctrl-C (or pkill -f run-ralph-codex.sh from another terminal)"
echo ""

iter=0
straggler_streak=0
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
    echo "(DRY_RUN) would invoke: codex exec $CODEX_ARGS ${CODEX_MODEL:+--model $CODEX_MODEL} ${CODEX_EFFORT:+-c model_reasoning_effort=\"$CODEX_EFFORT\"} < PROMPT.md" \
      | tee -a "$LOG_FILE"
    sleep 2
  else
    # NO_COLOR keeps the log file free of ANSI escapes when codex
    # auto-detects a TTY parent through `tee`.
    # --json + jq filter drops exec_command_output_delta (file/shell
    # content firehose) and agent_reasoning_* events; keeps run/conclude.
    set -o pipefail
    NO_COLOR=1 codex exec --json $CODEX_ARGS ${CODEX_MODEL:+--model "$CODEX_MODEL"} ${CODEX_EFFORT:+-c model_reasoning_effort="$CODEX_EFFORT"} < PROMPT.md 2>&1 \
      | jq -rc 'select((.type // .msg.type // "") | IN("agent_message","exec_command_begin","exec_command_end","task_started","task_complete","error","item.completed"))' \
      | tee -a "$LOG_FILE"
    rc=${PIPESTATUS[0]}
    set +o pipefail
    if (( rc != 0 )); then
      echo "⚠️  [$ts] codex exited non-zero ($rc) on iter $iter. Continuing." | tee -a "$LOG_FILE"
    fi
  fi

  # --- Commit straggler changes the iteration forgot to commit (defensive).
  #     Should be rare. If it happens repeatedly the agent is stuck — usually
  #     because it can't write to .git, or it's reading the same task each
  #     iteration without flipping the checkbox. We bail loudly rather than
  #     silently masking the failure with `|| true`.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    if git add -A && git commit -m "ralph-codex: iter ${iter} stragglers" >> "$LOG_FILE" 2>&1; then
      straggler_streak=$(( straggler_streak + 1 ))
      echo "⚠️  [$ts] iter $iter committed via straggler fallback — agent did not commit cleanly (streak: $straggler_streak/$STRAGGLER_LIMIT)" \
        | tee -a "$LOG_FILE"
      if (( straggler_streak >= STRAGGLER_LIMIT )); then
        echo "🛑 [$ts] $straggler_streak consecutive straggler iterations — loop is likely stuck. Inspect fix_plan.md and recent commits, then restart. Exiting." \
          | tee -a "$LOG_FILE"
        exit 2
      fi
    else
      echo "⚠️  [$ts] iter $iter had uncommitted changes but the fallback commit itself failed. Continuing." \
        | tee -a "$LOG_FILE"
    fi
  else
    straggler_streak=0
  fi

  sleep "$SLEEP_BETWEEN"
done
