// agents/_lib/planner.mjs
// Dedicated planner. Takes a user prompt plus Dynasty knowledge, calls a
// fast-tier model (Haiku 4.5 by default), and returns a plan conforming to
// the orchestrator's emit_plan schema.
//
// Splitting planning onto a fast tier cuts ~70% of planning-phase cost on
// long runs. The orchestrator still decides WHEN to replan (e.g. after a
// halt event); the planner just produces plans when asked.
// -----------------------------------------------------------------------------
import { loadAgent } from './prompt-loader.mjs';

const PLANNER_MODEL = process.env.PLANNER_MODEL || 'claude-haiku-4-5-20251001';
const PLANNER_FALLBACK_MODEL = process.env.PLANNER_FALLBACK_MODEL || 'claude-sonnet-4-6-20250514';

const PLANNER_SYSTEM = `You are the Dynasty Launcher Planner. You take a user's business idea plus Dynasty's operating doctrine and emit a structured plan of subagent tasks. You NEVER call tools; you NEVER invoke subagents; you ONLY emit the plan object.

The plan object conforms to the orchestrator's emit_plan schema:

{
  "items": [
    {
      "id": "p1",
      "subagent": "provisioner | code-generator | integrator | deployer | auditor",
      "task": "<one-sentence scope>",
      "depends_on": ["p0"],
      "acceptance": "<observable outcome that marks this item verified>",
      "estimated_iterations": 5
    }
  ],
  "operating_llc": "CXI | Obuke | Kwode | ToriMedia | NeatCircle"
}

Rules:
- Items that span two subagent types are a misplan — split them.
- Every item MUST have a concrete acceptance string (something observable).
- Items with no mutual dependencies run in parallel at the orchestrator tier; reflect that in depends_on.
- Operating LLC per the Dynasty entity routing principle.
- Output ONLY the JSON plan, no preamble or commentary.`;

export async function planRun({ userPrompt, tenantId = null, tier = 'foundation', priorHalts = [], apiKey }) {
  // Load the orchestrator's knowledge bundle (policies + dynasty principles +
  // blue-ocean framework) so the planner has the same doctrine context.
  const { system: orchestratorContext } = await loadAgent('orchestrator', { tenantId });

  const userMessage = JSON.stringify({
    user_prompt: userPrompt,
    tenant_id: tenantId,
    tier,
    prior_halts: priorHalts,
  });

  const req = {
    model: PLANNER_MODEL,
    max_tokens: 4000,
    system: PLANNER_SYSTEM + '\n\n---\n\n' + orchestratorContext,
    messages: [{ role: 'user', content: userMessage }],
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(req),
  });

  if (!resp.ok) {
    // Retry on fallback model (Sonnet) before surfacing the error.
    req.model = PLANNER_FALLBACK_MODEL;
    const retry = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req),
    });
    if (!retry.ok) throw new Error(`Planner both tiers failed: ${retry.status}`);
    const data = await retry.json();
    return parsePlan(data, PLANNER_FALLBACK_MODEL);
  }

  const data = await resp.json();
  return parsePlan(data, PLANNER_MODEL);
}

function parsePlan(data, modelUsed) {
  const text = (data.content || []).map(b => b.text || '').join('').trim();
  // Strip possible markdown fences
  const clean = text.replace(/^```json\s*|\s*```$/g, '').trim();
  let plan;
  try {
    plan = JSON.parse(clean);
  } catch (err) {
    throw new Error(`Planner returned non-JSON: ${err.message}`);
  }
  if (!Array.isArray(plan.items) || plan.items.length === 0) throw new Error('Planner returned empty items');
  if (!plan.operating_llc) throw new Error('Planner missing operating_llc');
  return { ...plan, _model_used: modelUsed };
}
