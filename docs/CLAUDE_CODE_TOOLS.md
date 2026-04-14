# Claude Code Tool Stack

Developer-environment tools installed on this account (not runtime dependencies of dynasty-launcher). Reproducible via `scripts/setup-claude-tools.sh`.

## What's installed

| Tool | Upstream | On-disk location | Role |
|---|---|---|---|
| everything-claude-code (ECC) | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) | `~/.claude/agents/`, `~/.claude/skills/`, `~/.claude/rules/`, `~/.claude/commands/`, `~/.claude/hooks/`, `~/.claude/mcp-configs/` | Broad skill + agent + rule + hook library (48 agents, ~150 skills installed) |
| gstack | [garrytan/gstack](https://github.com/garrytan/gstack) | `~/.claude/skills/gstack/` | Virtual engineering team: 23+ sprint-role skills (office-hours, plan-ceo-review, qa, ship, etc.) |
| superpowers | [obra/superpowers](https://github.com/obra/superpowers) | `~/.claude/plugins/superpowers/` | Think → Plan → Build → Review → Test → Ship skills plugin |
| hermes-agent | [nousresearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | `~/.hermes/` + `hermes` on PATH | Standalone self-improving agent CLI (unrelated to Claude Code) |

## Install order and conflict policy

The setup script installs in this order so earlier tools "win" any name collisions:

1. **ECC** first — largest surface, populates top-level `~/.claude/agents/`, `~/.claude/skills/`, `~/.claude/rules/`.
2. **gstack** next — lives entirely under `~/.claude/skills/gstack/`, so it can't collide with ECC's top-level skill dirs. Its `./setup` script also symlinks gstack skills into Claude Code's discovery path.
3. **superpowers** — cloned into `~/.claude/plugins/superpowers/` (out of the way of ECC's `~/.claude/skills/`).
4. **hermes-agent** last — separate CLI, installs under `~/.hermes/`. No Claude Code conflict possible.

The script is **idempotent**: each step checks for a marker (`.ecc-installed` for ECC, existence of the target dir for the others) and skips if already present. First installer wins.

## Reproducing the install

```bash
bash scripts/setup-claude-tools.sh            # install anything missing
bash scripts/setup-claude-tools.sh --dry-run  # show what would run
```

Requirements: `git`, `curl`. gstack additionally needs `bun` (v1.0+). Hermes installs via `uv`, which its installer auto-installs if missing.

## Per-tool notes

### everything-claude-code

Installed via `./install.sh --profile full --target claude`. Other profiles (language-specific: `typescript`, `python`, `golang`, `swift`, `php`) are available but not used here. Writes install state to `~/.claude/ecc/install-state.json`. Does **not** touch pre-existing `settings.json`, `stop-hook-git-check.sh`, or `skills/session-start-hook/`.

**Update:** re-run `~/.claude/ecc/install-apply.js` with fresh clone of upstream. **Uninstall:** manual — remove `~/.claude/agents/`, relevant `~/.claude/skills/<ecc-skill>/`, `~/.claude/rules/`, `~/.claude/commands/`, `~/.claude/ecc/`, and `.ecc-installed`.

### gstack

`./setup` builds the `browse` binary (Playwright-powered headless browser), downloads Chromium (~280 MB total), and symlinks each gstack skill (`autoplan`, `browse`, `office-hours`, `plan-ceo-review`, `qa`, `review`, `ship`, `retro`, `canary`, `freeze`, etc.) into Claude Code's skill discovery path.

**Known minor warning during `./setup`:** `error: cannot write multiple output files without an output directory` when building the Node-compatible server bundle. Skills still link correctly and the browse binary builds.

**Update:** `cd ~/.claude/skills/gstack && git pull && ./setup` or use `/gstack-upgrade`. **Uninstall:** `rm -rf ~/.claude/skills/gstack`.

### superpowers

Because the official install path is the interactive `/plugin install superpowers@claude-plugins-official` slash command (which can't be invoked programmatically), we fall back to a bare clone into `~/.claude/plugins/superpowers/`. The skill files are present, but **for Claude Code's plugin manager to register them officially** you should run this in an interactive Claude Code session:

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

**Update:** `cd ~/.claude/plugins/superpowers && git pull`. **Uninstall:** `rm -rf ~/.claude/plugins/superpowers` (and `/plugin uninstall superpowers` if registered via slash command).

### hermes-agent

Installed with `--skip-setup` so the interactive wizard (model provider selection, Telegram/Discord/Slack/WhatsApp/Signal tokens) isn't triggered during automated setup. The `hermes` binary lands on PATH after shell reload.

**Configure:** `hermes setup` (interactive). **Update:** `hermes update`. **Uninstall:** `rm -rf ~/.hermes` and remove the PATH entry added to `~/.bashrc` by the installer.

## Caveats

- ECC and gstack both ship a `/review` skill (and other common names like `/plan`, `/qa`). Both live on disk; Claude Code's skill resolver decides which fires at runtime based on description match. If you prefer one over the other for a given name, invoke it explicitly by its fully-qualified path or disable the other.
- `~/.claude/settings.json`, `~/.claude/stop-hook-git-check.sh`, and `~/.claude/skills/session-start-hook/` are untouched by this setup.
- These tools are for the **developer environment only** and have no runtime impact on the dynasty-launcher Vercel deployment or its `api/provision.js` module stack.
