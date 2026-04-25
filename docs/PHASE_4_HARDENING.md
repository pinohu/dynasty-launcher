# Phase 4 — Policy Hardening

## What changes

Four small utility modules that make Launcher safe to expose to external users. Each closes a specific class of bug; together they turn "internal tool" into "product you can sell."

## 1. agents/_lib/system-reminder.mjs

Conditional mid-conversation nudges. Rather than bloating every system prompt with every rule, reminders fire only when the current context crosses a condition. Modeled on Cursor 2.0's `<system_reminder>` pattern — the model heeds them, does not echo them back to the user.

Ships with five standing Dynasty reminders out of the box:

- `vercel-over-bd` fires when the provisioner sees a BD-related plan item.
- `deploy-live-first` fires when the orchestrator is 15+ iterations in without a deploy plan item.
- `git-identity` fires when the github_repo tool is about to be called.
- `neon-vercel-managed` fires on neon_project_create_or_get.
- `read-before-patch` fires when code-generator calls apply_patch without a recent read_file.

Usage:

```js
import { selectReminders, renderReminders } from './_lib/system-reminder.mjs';
const fired = selectReminders(ctx);
const text  = renderReminders(fired);  // empty string if none fired
```

## 2. agents/_lib/shell-wrapper.mjs

Every shell command routes through this. Refuses interactive commands (`vim`, `less`, `sudo`, etc.), auto-injects non-interactive flags (`-y` on apt-get, `BatchMode=yes` on ssh, `ON_ERROR_STOP=1` on psql), closes stdin so nothing can ever wait for input.

Kills the "subagent hanging on a confirmation prompt" failure mode outright.

Usage:

```js
import { runShell } from './_lib/shell-wrapper.mjs';
const { stdout, exit_code, duration_ms } = await runShell({
  cmd: 'gh', args: ['repo', 'create', 'my-repo', '--private'], timeout_ms: 30000,
});
```

## 3. agents/_lib/input-sanitizer.mjs

Sanitizes user-supplied text before it reaches a subagent prompt. Closes the prompt-injection surface on Launcher's front door.

Three-tier response:

- **Benign input** (no signals): wrapped in an inert `<user_input>` tag and returned. The model reads it as data, not as a nested instruction channel.
- **Instruction-smuggling** ("ignore previous instructions", "act as admin"): offending phrase replaced with `[REDACTED_INSTRUCTION_LIKE_PHRASE]`, signal emitted. Real business ideas sometimes contain innocent phrases like "ignore the competition," so we neutralize rather than refuse.
- **Tool-call-like syntax or jailbreak markers** (`<function_calls>`, `DAN mode`): hard refuse. Risk outweighs inconvenience.

Every sanitization emits a signal so log analysis can catch attack patterns.

## 4. agents/_lib/thinking-approval.mjs

Intercepts `<Thinking>` blocks emitted by subagents (primarily code-generator) as an approval seam. When approval is required, the orchestrator halts pending human sign-off; when not, execution proceeds unchanged.

Per-subagent policy:

- `never` (default) — today's behavior.
- `always` — every Thinking block requires approval.
- `on_first_write` — only the first code-generator Thinking per run.
- `on_stripe_live` — only when the provisioner touches live Stripe.

This is the seam that enables the human-in-the-loop premium tier. Enterprise / managed-launch customers set policy to `always` for key subagents; you or a VA approve key decision points; that's the product.

## Commercial unlocks

1. **Safe to expose externally.** Sanitizer + shell-wrapper + conditional reminders mean the Launcher can take input from non-Dynasty operators without catastrophic liability. Table stakes for opening it to customers.

2. **Compliance audit package.** Between Phase 3's structured event logs and Phase 4's policy-as-code (inline tool schemas, sanitizer signals, approval trails), Launcher has a compliance story regulated buyers can accept. Slots directly into LeadOS-Gov's procurement audience.

3. **Human-in-the-loop premium tier.** thinking-approval's policy model is the billing seam. Self-serve = `never`; agency = `on_first_write`; managed enterprise = `always`. Three prices from one code path.

## Smoke test

```
$ node scripts/smoke-phase4.mjs
PASS sanitize accepts + wraps benign input
PASS sanitize neutralizes instruction smuggling
PASS sanitize refuses tool-call-like input
PASS shell-wrapper blocks vim
PASS shell-wrapper injects -y for apt-get
PASS system-reminder selects + renders by ctx
PASS thinking-approval default=never
PASS thinking-approval always blocks

All Phase 4 checks passed.
```

## Rollout

1. Merge PRs #7 + #8 + #9 + #10 + this phase's PR in order.
2. No schema changes, no env var changes, no flag changes. These libraries are opt-in — existing code paths work without them.
3. Follow-up wiring PR: route the provisioner's shell calls through shell-wrapper, the orchestrator entrypoint through input-sanitizer, and the code-generator's Thinking emission through thinking-approval. Each is a small, focused change that can ship independently.
