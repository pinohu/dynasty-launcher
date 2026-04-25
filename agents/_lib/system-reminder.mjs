// agents/_lib/system-reminder.mjs
// Phase 4: conditional <system_reminder> injector. Modeled on Cursor 2.0's
// pattern — mid-conversation nudges the model heeds but does not echo back
// to the user.
//
// Rather than bloating every system prompt with every rule, reminders fire
// only when the current context crosses a condition. Keep rules close to
// when they matter.
// -----------------------------------------------------------------------------

// A reminder is { id, when, text }.
// when(ctx) returns true if the reminder should fire this iteration.
// Registered reminders are evaluated in order; the first matching set (up to
// MAX_PER_TURN) is injected.

const MAX_PER_TURN = 3;
const REGISTRY = [];

export function registerReminder(reminder) {
  if (!reminder.id || !reminder.when || !reminder.text) {
    throw new Error('reminder requires id, when(ctx), text');
  }
  REGISTRY.push(reminder);
}

export function clearReminders() { REGISTRY.length = 0; }

// ctx: { subagent, plan_item, last_observation, iteration, elapsed_seconds, tool_name }
export function selectReminders(ctx) {
  const selected = [];
  for (const r of REGISTRY) {
    try {
      if (r.when(ctx)) selected.push(r);
      if (selected.length >= MAX_PER_TURN) break;
    } catch { /* a broken predicate never blocks */ }
  }
  return selected;
}

export function renderReminders(reminders) {
  if (!reminders.length) return '';
  return reminders
    .map((r) => `<system_reminder id="${r.id}">\n${r.text}\n</system_reminder>`)
    .join('\n\n');
}

// ── Standing Dynasty reminders ───────────────────────────────────────────────

registerReminder({
  id: 'vercel-over-bd',
  when: (ctx) => ctx.subagent === 'provisioner' && /brilliant/i.test(ctx.plan_item?.task || ''),
  text: 'Dynasty principle 2: Vercel over Brilliant Directories for new properties. BD licenses are reserved for directory-shaped products with claimed listings. Confirm this task genuinely needs BD before creating a BD site.',
});

registerReminder({
  id: 'deploy-live-first',
  when: (ctx) => ctx.subagent === 'orchestrator' && ctx.iteration > 15 && !ctx.plan_item?.task?.includes('deploy'),
  text: 'Dynasty principle 1: every run targets a public URL by its last iteration. You are 15+ iterations in without a deploy plan item — verify scope or escalate.',
});

registerReminder({
  id: 'git-identity',
  when: (ctx) => ctx.tool_name === 'github_repo_create_or_get',
  text: 'Before any git push on a new repo, set user.email=polycarpohu@gmail.com and user.name=pinohu. Vercel rejects other commit authors.',
});

registerReminder({
  id: 'neon-vercel-managed',
  when: (ctx) => ctx.tool_name === 'neon_project_create_or_get',
  text: 'Provision Neon via the Vercel integration path — direct Neon API creates orphaned projects that do not bill correctly.',
});

registerReminder({
  id: 'read-before-patch',
  when: (ctx) => ctx.subagent === 'code-generator' && ctx.tool_name === 'apply_patch' && (ctx.iterations_since_read_file || 0) > 5,
  text: 'You have not read this file in >5 iterations. Read it again before apply_patch — the content_sha will not match otherwise.',
});
