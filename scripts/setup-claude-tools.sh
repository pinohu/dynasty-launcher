#!/usr/bin/env bash
# setup-claude-tools.sh
#
# Reproducible installer for the Claude Code tool stack used on this account.
# Conflict policy: first installer wins — later installers skip any target
# directory that already exists (idempotent; safe to re-run).
#
# Tools installed (in this order, so earlier names "claim" conflicts):
#   1. affaan-m/everything-claude-code  → ~/.claude/ (agents, skills, rules, hooks)
#   2. garrytan/gstack                   → ~/.claude/skills/gstack/
#   3. obra/superpowers                  → ~/.claude/plugins/superpowers/
#   4. nousresearch/hermes-agent         → ~/.hermes/ (standalone CLI; curl|bash)
#
# Usage:
#   bash scripts/setup-claude-tools.sh            # install anything missing
#   bash scripts/setup-claude-tools.sh --dry-run  # print actions, make no changes

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
HERMES_DIR="$HOME/.hermes"

say() { printf '==> %s\n' "$*"; }
skip() { printf '    skip: %s — already installed\n' "$*"; }
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '    [dry-run] %s\n' "$*"
  else
    eval "$@"
  fi
}

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' not found on PATH" >&2
    exit 1
  }
}

need git
need curl

mkdir -p "$CLAUDE_DIR"

# ---------------------------------------------------------------------------
# 1. everything-claude-code (ECC) — https://github.com/affaan-m/everything-claude-code
# ---------------------------------------------------------------------------
say "everything-claude-code"
ECC_MARKER="$CLAUDE_DIR/.ecc-installed"
if [ -f "$ECC_MARKER" ]; then
  skip "everything-claude-code ($ECC_MARKER exists)"
else
  ECC_TMP="$(mktemp -d)"
  run "git clone --depth 1 https://github.com/affaan-m/everything-claude-code.git '$ECC_TMP/ecc'"
  # The installer is interactive by default; CI=1 + piping 'y' handles common prompts.
  run "cd '$ECC_TMP/ecc' && CI=1 bash install.sh --profile full --target claude < /dev/null || true"
  run "touch '$ECC_MARKER'"
  run "rm -rf '$ECC_TMP'"
fi

# ---------------------------------------------------------------------------
# 2. gstack — https://github.com/garrytan/gstack
# ---------------------------------------------------------------------------
say "gstack"
GSTACK_DIR="$CLAUDE_DIR/skills/gstack"
if [ -d "$GSTACK_DIR" ]; then
  skip "gstack ($GSTACK_DIR exists)"
else
  run "git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git '$GSTACK_DIR'"
  if [ -x "$GSTACK_DIR/setup" ]; then
    # setup wants bun/node; warn rather than fail if they're missing.
    if command -v bun >/dev/null 2>&1 || command -v node >/dev/null 2>&1; then
      run "cd '$GSTACK_DIR' && ./setup < /dev/null || true"
    else
      echo "    warn: bun/node not found; skipping gstack ./setup (skills still cloned)"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3. superpowers — https://github.com/obra/superpowers
# ---------------------------------------------------------------------------
say "superpowers"
SP_DIR="$CLAUDE_DIR/plugins/superpowers"
if [ -d "$SP_DIR" ]; then
  skip "superpowers ($SP_DIR exists)"
else
  run "mkdir -p '$CLAUDE_DIR/plugins'"
  run "git clone --depth 1 https://github.com/obra/superpowers.git '$SP_DIR'"
  echo "    note: for full /plugin integration, run in an interactive Claude Code session:"
  echo "          /plugin marketplace add obra/superpowers-marketplace"
  echo "          /plugin install superpowers@superpowers-marketplace"
fi

# ---------------------------------------------------------------------------
# 4. hermes-agent — https://github.com/NousResearch/hermes-agent
# ---------------------------------------------------------------------------
say "hermes-agent"
if [ -d "$HERMES_DIR" ]; then
  skip "hermes-agent ($HERMES_DIR exists)"
else
  HERMES_URL="https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh"
  # --skip-setup avoids the interactive wizard (model provider, messaging tokens);
  # user can run 'hermes setup' later to configure.
  run "curl -fsSL '$HERMES_URL' | bash -s -- --skip-setup"
  echo "    note: run 'hermes setup' to configure model provider + messaging tokens"
  echo "    note: reload shell to pick up the 'hermes' binary on PATH"
fi

say "done"
