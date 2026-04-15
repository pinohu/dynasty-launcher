#!/usr/bin/env bash
# hermes-bootstrap.sh
#
# One-shot non-interactive hermes configuration. Skips the interactive
# wizard by writing the key(s) directly to ~/.hermes/.env and then
# provisioning the dynasty-launcher watcher jobs.
#
# Usage — pick ONE provider:
#   ANTHROPIC_API_KEY=sk-ant-xxx bash scripts/hermes-bootstrap.sh
#   OPENROUTER_API_KEY=sk-or-xxx bash scripts/hermes-bootstrap.sh
#   OPENAI_API_KEY=sk-xxx         bash scripts/hermes-bootstrap.sh
#   GOOGLE_API_KEY=xxx            bash scripts/hermes-bootstrap.sh
#
# Optional — where to deliver alerts (default: local log file):
#   HERMES_DELIVER=telegram:123456789   # your Telegram chat id
#   HERMES_DELIVER=discord:0987654321   # your Discord channel id
#   HERMES_DELIVER=signal:+15551234567  # your Signal number
#
# Combined example:
#   ANTHROPIC_API_KEY=sk-ant-xxx \
#   HERMES_DELIVER=telegram:123456789 \
#   bash scripts/hermes-bootstrap.sh

set -euo pipefail

HERMES_ENV="${HERMES_ENV:-$HOME/.hermes/.env}"
DELIVER="${HERMES_DELIVER:-local}"

command -v hermes >/dev/null 2>&1 || {
  echo "error: 'hermes' not on PATH. Run scripts/setup-claude-tools.sh first." >&2
  exit 1
}

# Detect which provider key was supplied
PROVIDER=""
KEY_VAR=""
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then PROVIDER="anthropic"; KEY_VAR="ANTHROPIC_API_KEY"
elif [ -n "${OPENROUTER_API_KEY:-}" ];  then PROVIDER="openrouter"; KEY_VAR="OPENROUTER_API_KEY"
elif [ -n "${OPENAI_API_KEY:-}" ];      then PROVIDER="openai"; KEY_VAR="OPENAI_API_KEY"
elif [ -n "${GOOGLE_API_KEY:-}" ];      then PROVIDER="gemini"; KEY_VAR="GOOGLE_API_KEY"
elif [ -n "${GEMINI_API_KEY:-}" ];      then PROVIDER="gemini"; KEY_VAR="GEMINI_API_KEY"
elif [ -n "${GROQ_API_KEY:-}" ];        then PROVIDER="groq"; KEY_VAR="GROQ_API_KEY"
else
  echo "error: no provider key in env. Set ONE of: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, GROQ_API_KEY." >&2
  exit 1
fi

echo "==> provider detected: $PROVIDER (from \$$KEY_VAR)"

# Append the key to ~/.hermes/.env if not already present
if grep -q "^$KEY_VAR=" "$HERMES_ENV" 2>/dev/null; then
  echo "    $KEY_VAR already in $HERMES_ENV — leaving as-is"
else
  KEY_VALUE="${!KEY_VAR}"
  printf '\n# Added by hermes-bootstrap.sh\n%s=%s\n' "$KEY_VAR" "$KEY_VALUE" >> "$HERMES_ENV"
  chmod 600 "$HERMES_ENV"
  echo "    wrote $KEY_VAR to $HERMES_ENV (mode 600)"
fi

# Sanity-check hermes sees the config
echo "==> hermes config summary:"
hermes config 2>&1 | grep -E '(API Keys|OpenRouter|Anthropic|OpenAI|Gemini|Groq)' | head -6 || true

# Arm the dynasty-launcher watcher
echo "==> provisioning dynasty-launcher watcher with HERMES_DELIVER=$DELIVER"
HERMES_DELIVER="$DELIVER" bash "$(dirname "$0")/hermes-dynasty-watcher.sh" || {
  echo "    warn: watcher setup returned non-zero — check 'hermes cron list'"
}

echo "==> done. Verify:  hermes cron list"
echo "    If HERMES_DELIVER=local, alerts log to ~/.hermes/logs/"
echo "    Otherwise, first run may take 60s to send via gateway."
