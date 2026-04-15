#!/usr/bin/env bash
# hermes-dynasty-watcher.sh
#
# Provisions an unattended hermes cron job that monitors the dynasty-launcher
# production deployment and reports to a messaging platform.
#
# Pre-requisites (run ONCE before this script):
#   1. scripts/setup-claude-tools.sh  — installs hermes to ~/.hermes/
#   2. hermes setup                    — pick a model provider, paste API key
#   3. One of:
#        - Telegram:  hermes gateway install  +  set TELEGRAM_CHAT_ID below
#        - Discord:   hermes gateway install  +  set DISCORD_CHANNEL_ID below
#        - Signal:    hermes gateway install  +  set SIGNAL_RECIPIENT below
#      (or keep DELIVER="local" to just log to ~/.hermes/logs/)
#
# What this installs:
#   - Job 1: every 15m — hit /api/health, alert on non-200 or payload drift
#   - Job 2: every hour — hit /api/provision?action=inventory, alert if any
#              previously-wired vendor key drops to keys_present:false
#   - Job 3: daily 09:00 UTC — summary of key inventory + module readiness
#             (Foundation/Professional/Enterprise runnability)
#
# To remove:  bash scripts/hermes-dynasty-watcher.sh --remove

set -euo pipefail

# ─── Configuration (edit these before running) ────────────────────────────────
BASE_URL="${BASE_URL:-https://dynasty-launcher.vercel.app}"
DELIVER="${HERMES_DELIVER:-local}"   # local | telegram:<chat_id> | discord:<channel_id> | signal:<recipient>
MODEL="${HERMES_MODEL:-}"            # optional; defaults to whatever hermes setup chose
# ──────────────────────────────────────────────────────────────────────────────

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' not on PATH" >&2; exit 1; }
}

require hermes

# Remove mode
if [ "${1:-}" = "--remove" ]; then
  echo "==> removing dynasty-launcher watcher jobs"
  for name in dl-health-ping dl-inventory-drift dl-daily-summary; do
    hermes cron remove "$name" 2>/dev/null && echo "    removed: $name" || echo "    skip:    $name (not found)"
  done
  exit 0
fi

echo "==> provisioning dynasty-launcher watcher"
echo "    base: $BASE_URL"
echo "    deliver: $DELIVER"

COMMON_OPTS=(--deliver "$DELIVER")
[ -n "$MODEL" ] && COMMON_OPTS+=(--model "$MODEL")

# ─── Job 1: health-ping every 15m ─────────────────────────────────────────────
hermes cron create "15m" \
  --name "dl-health-ping" \
  "${COMMON_OPTS[@]}" \
  "Check the health of dynasty-launcher at ${BASE_URL}/api/health.
Report ONLY if the HTTP status is not 200 or the response indicates a degraded component.
When reporting, include: status code, response body, UTC timestamp.
Do NOT report successful health checks — silence is success." || {
    echo "    warn: job dl-health-ping may already exist"
  }

# ─── Job 2: inventory drift every hour ────────────────────────────────────────
hermes cron create "1h" \
  --name "dl-inventory-drift" \
  "${COMMON_OPTS[@]}" \
  "Fetch ${BASE_URL}/api/provision?action=inventory and compare modules[*].keys_present
against the previous run (stored in ~/.hermes/memories/dl-inventory-last.json).
Report ONLY if a key that was previously true flips to false
(this indicates a vendor key was revoked or expired).
Update the stored snapshot after each run." || {
    echo "    warn: job dl-inventory-drift may already exist"
  }

# ─── Job 3: daily summary at 09:00 UTC ────────────────────────────────────────
hermes cron create "0 9 * * *" \
  --name "dl-daily-summary" \
  "${COMMON_OPTS[@]}" \
  "Produce a daily summary of dynasty-launcher at ${BASE_URL}:
1. /api/health status
2. /api/provision?action=inventory — list which of the 19 mod_* modules have keys present vs missing
3. Tier readiness: for each of foundation, professional, enterprise, custom_volume, say whether all
   required keys are wired.
4. Flag the top 3 highest-impact missing keys (chatbase, vista_social, writerzen are usually priority).
Keep the summary under 200 words." || {
    echo "    warn: job dl-daily-summary may already exist"
  }

echo "==> done"
echo ""
echo "Check status:     hermes cron status"
echo "List jobs:        hermes cron list"
echo "Pause one:        hermes cron pause <name>"
echo "Run one now:      hermes cron run <name>"
echo "Remove all:       bash scripts/hermes-dynasty-watcher.sh --remove"
