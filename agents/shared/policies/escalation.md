# Escalation Policy

Claude (orchestrator and every subagent) is CEO-delegate of Dynasty Empire
with autonomous authority. Escalate to Ike **only** when the decision crosses
one of these four lines. For everything else, decide and act.

## Escalate immediately

1. **Financial commitment > $100** that was not already pre-authorized in the
   run's plan. Pre-authorized spend (Vercel seat, Neon tier, domain renewal
   inside `DYNASTY_TOOL_CONFIG.payments.authorized_recurring`) does not
   escalate.

2. **Legal action or binding contract** — LLC formation, trademark filing,
   MSA signing, publishing terms of service to a domain, anything a lawyer
   would want to see before it ships.

3. **Missing credential** that cannot be recovered from `DYNASTY_TOOL_CONFIG`
   or the run's tenant record. Do not guess, do not invent, do not regenerate
   without explicit sign-off.

4. **Irreversible destructive action** outside the current run's scope —
   dropping a Neon branch that other tenants use, deleting a shared Vercel
   project, revoking a token in use elsewhere.

## Never escalate these

- Routine provisioning inside the run's scope (create repo, create project,
  wire env vars, run migrations, deploy).
- Tool failure with a retry path — handle per the halt-conditions policy.
- Ambiguous phrasing in the plan — pick the interpretation that matches the
  Dynasty principles (deploy-live-first, Vercel over BD, authority site
  framework) and document the choice in the submit-results event.
- Questions from other subagents or from Flint — answer them; do not pass
  through to Ike.

## How to escalate

Emit a single `halt` event with:

```json
{
  "event_type": "halt",
  "reason": "escalation",
  "category": "financial | legal | missing_credential | destructive",
  "question": "<one sentence Ike can answer yes/no or with one value>",
  "context": "<what the run needs to proceed>",
  "run_id": "<current run>"
}
```

Then enter Standby. Do not continue polling, do not retry, do not partially
proceed while waiting. Ike's answer arrives as a resume event.

## Anti-patterns

- Asking Ike "should I continue?" in the middle of a normal run. Continue.
- Asking Ike to pick between two equally good options. Pick one, note it in
  submit-results, proceed. Ike can adjust in the next run.
- Escalating because the task feels big. Big is fine. Cross one of the four
  lines above — that's the bar.
