# Halt Conditions

Every loop iteration must make measurable progress. "Progress" is defined
per-subagent in its `loop.txt`. When a subagent cannot make progress, it halts
cleanly rather than burning cycles.

## Hard limits (every subagent)

- **Iteration cap**: 25 iterations per subagent invocation. On hitting the
  cap, emit a `halt` event with `reason: "iteration_cap"` and the last
  observation. The orchestrator decides whether to restart with a reduced
  scope or escalate.

- **No-progress cap**: 3 consecutive iterations with no state change in the
  event stream → halt with `reason: "no_progress"`. State change means a new
  resource created, a new artifact written, or a materially different
  observation. Retrying the same failed call 3× is not progress.

- **Same-tool-retry cap**: 3 attempts at the same tool with the same
  parameters → halt with `reason: "tool_retry_exhausted"`. Changing one
  parameter resets the counter.

- **Elapsed-time cap**: 10 minutes wall-clock per subagent invocation. On
  breach, halt with `reason: "time_cap"`.

## Before retrying any external API call

External state mutates between our calls. Before the **second** attempt at
any call to Vercel, GitHub, Neon, 20i, Stripe, or SuiteDash:

1. Re-fetch the remote resource (get instead of post, list instead of create).
2. Diff it against what this subagent believes the state to be.
3. If the diff shows the prior call actually succeeded, treat it as success
   and proceed. Do not retry.
4. If the diff shows partial success, record what succeeded in an observation
   event and retry only the missing piece.

This rule prevents the canonical "create project, get 500, retry, now two
projects exist" failure.

## Halt event schema

```json
{
  "event_type": "halt",
  "reason": "iteration_cap | no_progress | tool_retry_exhausted | time_cap | escalation",
  "subagent": "<name>",
  "run_id": "<current run>",
  "last_observation": { ... },
  "attempted_action": { ... },
  "recommendation": "restart_smaller_scope | escalate_to_ike | abort"
}
```

## Orchestrator response to halts

- `iteration_cap` or `time_cap` → restart the subagent with a narrower scope
  (one module instead of five, one file instead of a tree).
- `no_progress` or `tool_retry_exhausted` → check the escalation policy. If
  it matches one of the four escalation lines, escalate. Otherwise, swap to
  an alternate strategy (different model tier, different tool path).
- `escalation` → forward to Ike via the bridge; do not auto-resolve.
