#!/usr/bin/env bash
# wire-mcp-keys.sh
#
# Non-interactive filler for ~/.claude/mcp-configs/mcp-servers.json — reads
# keys from env vars and replaces the YOUR_*_HERE placeholders. Only MCPs
# whose keys are actually provided will be wired; the rest stay as templates.
#
# Priority list for dynasty-launcher: vercel, context7, exa-web-search, omega-memory.
# (context7 and omega-memory typically need no key and work out of the box.)
#
# Usage — supply any subset of these env vars:
#   EXA_API_KEY=xxx                       bash scripts/wire-mcp-keys.sh
#   GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx  bash scripts/wire-mcp-keys.sh
#   FIRECRAWL_API_KEY=fc-xxx              bash scripts/wire-mcp-keys.sh
#   BROWSERBASE_API_KEY=bb_xxx            bash scripts/wire-mcp-keys.sh
#   FAL_KEY=fal-xxx                       bash scripts/wire-mcp-keys.sh
#   CONFLUENCE_BASE_URL=...
#   CONFLUENCE_EMAIL=...
#   CONFLUENCE_API_TOKEN=...
#   JIRA_URL=... JIRA_EMAIL=... JIRA_API_TOKEN=...
#   SUPABASE_PROJECT_REF=xxx              (replaces --project-ref placeholder)
#
# Vercel MCP is HTTP-based with no key field in the config; it uses your
# browser-based auth instead. Context7 and omega-memory are keyless.
#
# Safe to re-run; only replaces placeholders, never overwrites real values.

set -euo pipefail

MCP_FILE="${MCP_FILE:-$HOME/.claude/mcp-configs/mcp-servers.json}"
[ -f "$MCP_FILE" ] || { echo "error: $MCP_FILE not found" >&2; exit 1; }

# Use Node's JSON.parse so we don't mangle anything
replace_key() {
  local placeholder="$1"
  local value="$2"
  [ -z "$value" ] && return 0
  node -e "
const fs = require('fs');
const p = process.argv[1];
const placeholder = process.argv[2];
const value = process.argv[3];
const raw = fs.readFileSync(p, 'utf8');
if (!raw.includes(placeholder)) process.exit(0);
const out = raw.split(placeholder).join(value);
fs.writeFileSync(p, out);
console.log('    wired: ' + placeholder + ' -> ****' + value.slice(-4));
" "$MCP_FILE" "$placeholder" "$value"
}

echo "==> wiring ${MCP_FILE}"
echo "    only MCPs with env keys provided will be wired; rest stay as templates"

replace_key "YOUR_GITHUB_PAT_HERE"       "${GITHUB_PERSONAL_ACCESS_TOKEN:-${GITHUB_TOKEN:-}}"
replace_key "YOUR_FIRECRAWL_KEY_HERE"    "${FIRECRAWL_API_KEY:-}"
replace_key "YOUR_EXA_API_KEY_HERE"      "${EXA_API_KEY:-}"
replace_key "YOUR_BROWSERBASE_KEY_HERE"  "${BROWSERBASE_API_KEY:-}"
replace_key "YOUR_BROWSER_USE_KEY_HERE"  "${BROWSER_USE_API_KEY:-}"
replace_key "YOUR_FAL_KEY_HERE"          "${FAL_KEY:-}"
replace_key "YOUR_PROJECT_REF"           "${SUPABASE_PROJECT_REF:-}"
replace_key "YOUR_JIRA_URL_HERE"         "${JIRA_URL:-}"
replace_key "YOUR_JIRA_EMAIL_HERE"       "${JIRA_EMAIL:-}"
replace_key "YOUR_JIRA_API_TOKEN_HERE"   "${JIRA_API_TOKEN:-}"
replace_key "YOUR_CONFLUENCE_URL_HERE"   "${CONFLUENCE_BASE_URL:-}"
replace_key "YOUR_EMAIL_HERE"            "${CONFLUENCE_EMAIL:-}"
replace_key "YOUR_CONFLUENCE_TOKEN_HERE" "${CONFLUENCE_API_TOKEN:-}"
replace_key "YOUR_OPENAI_API_KEY_HERE"   "${OPENAI_API_KEY:-}"

# Validate the result is still parseable
node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$MCP_FILE" \
  && echo "==> JSON still valid" \
  || { echo "error: MCP file JSON is now invalid — restore from git"; exit 1; }

echo ""
echo "==> unset placeholders remaining (these MCPs are still templates):"
grep -oE 'YOUR_[A-Z_]+_HERE' "$MCP_FILE" | sort -u | sed 's/^/    /'

echo ""
echo "==> next step: copy the wired MCP entries you actually want into ~/.claude.json"
echo "    under mcpServers. Keep under 10 enabled to preserve context window."
echo "    For dynasty-launcher, the priority 4 are: vercel (keyless), context7"
echo "    (keyless), exa-web-search (EXA_API_KEY), omega-memory (keyless)."
