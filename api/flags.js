// Phase 1: modular agents feature flag (file-backed prompt assembly).
// When true, api/orchestrate.js loads system prompts from agents/ instead
// of inline strings. Default false — zero behavior change when off.
export const USE_MODULAR_AGENTS = process.env.USE_MODULAR_AGENTS === 'true';

// ── Your Deputy — Feature Flags ─────────────────────────────────────────
// Inspired by Claude Code's compile-time feature flag system (KAIROS, BUDDY, etc.)
// Enables safe iteration, A/B testing, and gated rollouts.
export const maxDuration = 10;

const DEFAULT_FLAGS = {
  // ── Build Pipeline ─────────────────────────────────────────────────────────
  parallel_generation:   { enabled: true,  label: 'Parallel AI Generation',     description: 'Run independent build phases concurrently (~3x faster)' },
  smart_routing:         { enabled: true,  label: 'Smart Model Routing',        description: 'Route phases to optimal models by complexity (Opus for architecture, Haiku for boilerplate)' },
  context_compaction:    { enabled: true,  label: 'Context Compaction',         description: 'Compress outputs between phases for cross-file coherence' },
  preflight_review:      { enabled: true,  label: 'Preflight Review',           description: 'Show confirmation before GitHub push and infrastructure provisioning' },

  // ── Memory & Iteration ─────────────────────────────────────────────────────
  project_memory:        { enabled: true,  label: 'Project Memory',             description: 'Track build history and learn from past launches' },
  claude_md_readback:    { enabled: true,  label: 'CLAUDE.md Read-Back',        description: 'Read existing CLAUDE.md for iterative updates instead of fresh builds' },

  // ── Experimental ───────────────────────────────────────────────────────────
  coherence_pass:        { enabled: false, label: 'Coherence Pass',             description: 'Final AI review of all generated files for consistency' },
  authority_ab_test:     { enabled: true,  label: 'Authority A/B Headlines',    description: 'Generate A/B test headline variants for authority sites' },
  social_calendar:       { enabled: true,  label: '1-Year Social Calendar',     description: 'Generate 260-post social media calendar across 5 platforms' },
  outscraper_directory:  { enabled: true,  label: 'Real Business Listings',     description: 'Pull real Google Maps data via Outscraper instead of AI-generated listings' },
  pivot_review:          { enabled: true,  label: 'Strategic Pivot Review',     description: 'Multi-agent strategic review before build' },
  use_modular_agents:    { enabled: false, label: 'Modular Agent Prompts',     description: 'Load orchestrator+subagent prompts from agents/ directory instead of inline (Phase 1)' },

  // ── Project Types (gated) ──────────────────────────────────────────────────
  leados_gov_template:   { enabled: false, label: 'LeadOS-Gov Template',        description: 'Government SaaS project template (experimental)' },
  crop_client_template:  { enabled: false, label: 'PA CROP Client Template',    description: 'Pre-configured for PA CROP client onboarding' },
  wordpress_deploy:      { enabled: true,  label: 'WordPress Deploy',           description: 'Deploy WordPress sites via 20i' },
  fullstack_deploy:      { enabled: true,  label: 'Full-Stack Deploy',          description: 'Generate and deploy Next.js frontend with backend' },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Load overrides from env
  let overrides = {};
  try {
    const config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');
    overrides = config.feature_flags || {};
  } catch {}

  // Merge: env overrides > defaults
  const flags = {};
  for (const [key, def] of Object.entries(DEFAULT_FLAGS)) {
    flags[key] = {
      ...def,
      enabled: overrides[key] !== undefined ? !!overrides[key] : def.enabled,
    };
  }

  // GET — return current flags
  if (req.method === 'GET') {
    return res.json({ flags, source: 'defaults+env' });
  }

  // POST — check specific flags
  if (req.method === 'POST') {
    const { check } = req.body || {};
    if (Array.isArray(check)) {
      const results = {};
      for (const key of check) {
        results[key] = flags[key]?.enabled ?? false;
      }
      return res.json({ results });
    }
    return res.status(400).json({ error: 'POST body needs { check: ["flag_name", ...] }' });
  }

  return res.status(405).json({ error: 'GET or POST only' });
}
