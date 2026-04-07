// ── Dynasty Launcher — Build Orchestrator ────────────────────────────────────
// Implements 4 Claude Code architectural patterns:
//   1. Parallel subagent execution (Fork/Teammate/Worktree model)
//   2. Context compaction between phases (5-strategy pattern)
//   3. Smart model routing by task complexity
//   4. Preflight review before destructive actions
//   5. CLAUDE.md read-back for iterative builds
export const maxDuration = 300;

// ── Smart Model Routing ──────────────────────────────────────────────────────
// Maps task complexity to optimal model (like Claude Code's internal routing)
const ROUTING_TIERS = {
  // Architect-level: complex strategy, needs highest quality
  architect: {
    anthropic: 'claude-opus-4-20250514',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
    deepseek: 'deepseek-reasoner',
    fallback: 'claude-sonnet-4-20250514',
  },
  // Standard: most generation tasks
  standard: {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4.1',
    google: 'gemini-2.5-pro',
    deepseek: 'deepseek-chat',
    mistral: 'mistral-large-latest',
    fallback: 'claude-sonnet-4-20250514',
  },
  // Fast: boilerplate, templates, simple generation
  fast: {
    anthropic: 'claude-haiku-4-5-20251001',
    openai: 'gpt-4.1-mini',
    google: 'gemini-2.5-flash',
    groq: 'llama-3.3-70b-versatile',
    mistral: 'mistral-small-latest',
    fallback: 'claude-haiku-4-5-20251001',
  },
};

// Phase → tier mapping (which phases need which quality level)
const PHASE_TIERS = {
  // Architect tier — these define the entire project
  blueprint:    'architect',  // Initial architecture/data-model/API-contract decisions
  design:       'architect',  // Design system (feeds everything visual)
  business:     'architect',  // Business strategy (revenue, GTM, failure modes)

  // Standard tier — bulk generation
  spec:         'standard',   // Product docs (SPEC, ROADMAP, README)
  backend:      'standard',   // FastAPI backend code
  frontend:     'standard',   // Next.js scaffold
  agents:       'standard',   // Agent system + failure modes
  social_cal:   'standard',   // Social media calendar

  // Fast tier — boilerplate and templates
  env:          'fast',       // .env.example
  docker:       'fast',       // Dockerfile + docker-compose
  gitignore:    'fast',       // .gitignore
  manual:       'fast',       // MANUAL-ACTIONS.md
  dynasty_design: 'fast',    // DYNASTY-DESIGN.md (template, mostly static)
  coherence:    'standard',   // Final coherence review
};

function routeModel(phaseId, preferredProvider, userOverride) {
  if (userOverride) return userOverride;
  const tier = PHASE_TIERS[phaseId] || 'standard';
  const tierModels = ROUTING_TIERS[tier];
  return tierModels[preferredProvider] || tierModels.fallback;
}

// ── Context Compaction ───────────────────────────────────────────────────────
// After each phase, compress outputs into a compact context object.
// This ensures later phases have architectural coherence without full token cost.
function compactPhaseOutput(phaseId, rawOutput) {
  // Strategy: extract key decisions, naming conventions, and structural patterns
  const compact = {
    phase: phaseId,
    timestamp: new Date().toISOString(),
    // Extract key signals based on phase type
    signals: {},
  };

  if (!rawOutput || typeof rawOutput !== 'object') {
    compact.signals = { raw_length: String(rawOutput || '').length };
    return compact;
  }

  // Design phase → extract color palette, fonts, component patterns
  if (phaseId === 'design' || phaseId === 'blueprint') {
    const designText = rawOutput.design_md || rawOutput.claude_md || '';
    const hexMatches = designText.match(/#[0-9A-Fa-f]{6}/g) || [];
    const fontMatches = designText.match(/(?:font-family|Font)[:\s]+([^;\n,]+)/gi) || [];
    compact.signals = {
      colors: [...new Set(hexMatches)].slice(0, 12),
      fonts: [...new Set(fontMatches.map(f => f.replace(/font-family[:\s]+/i, '').trim()))].slice(0, 4),
      has_dark_mode: /dark\s*mode|\.dark/i.test(designText),
      key_decisions: designText.match(/(?:MUST|ALWAYS|NEVER|REQUIRED)[^.\n]{10,60}/gi)?.slice(0, 8) || [],
    };
  }

  // Spec phase → extract entities, features, integrations
  if (phaseId === 'spec') {
    const specText = rawOutput.spec_md || '';
    compact.signals = {
      features_p0: (specText.match(/### P0[\s\S]*?(?=### P1|$)/)?.[0] || '').slice(0, 500),
      data_entities: specText.match(/(?:User|Admin|Project|Order|Invoice|Task|Event|Listing|Lead|Client|Report)\b/gi)
        ?.filter((v, i, a) => a.indexOf(v) === i)?.slice(0, 10) || [],
      integrations: specText.match(/(?:Stripe|Neon|Vercel|Clerk|Inngest|Redis|SuiteDash|Twilio|SendGrid)\b/gi)
        ?.filter((v, i, a) => a.indexOf(v) === i) || [],
    };
  }

  // Business phase → extract revenue model, pricing, acquisition channels
  if (phaseId === 'business') {
    const bizText = rawOutput.business_md || rawOutput.revenue_md || '';
    compact.signals = {
      revenue_model: bizText.match(/(?:subscription|one-time|freemium|marketplace|SaaS|advertising|transaction fee)/i)?.[0] || '',
      price_points: bizText.match(/\$[\d,.]+(?:\/mo|\/yr|\/month|\/year)?/g)?.slice(0, 5) || [],
      channels: bizText.match(/(?:SEO|Content Marketing|Paid Ads|Partnerships|Referral|Social Media|Email|Cold Outreach)/gi)
        ?.filter((v, i, a) => a.indexOf(v) === i)?.slice(0, 6) || [],
    };
  }

  // Backend phase → extract routes, models, auth pattern
  if (phaseId === 'backend') {
    const backendText = rawOutput.main_py || '';
    compact.signals = {
      routes: (backendText.match(/@(?:app|router)\.(get|post|put|delete|patch)\(['"]([^'"]+)/gi) || []).slice(0, 15),
      has_auth: /jwt|oauth|bearer|clerk|auth/i.test(backendText),
      has_db: /sqlalchemy|prisma|drizzle|neon|postgres/i.test(backendText),
    };
  }

  return compact;
}

// Build a compressed context string from accumulated phase compactions
function buildCompactContext(compactions) {
  if (!compactions.length) return '';

  let ctx = '## Build Context (from prior phases)\n';
  for (const c of compactions) {
    ctx += `\n### ${c.phase} phase decisions:\n`;
    for (const [key, val] of Object.entries(c.signals || {})) {
      if (Array.isArray(val) && val.length) {
        ctx += `- ${key}: ${val.join(', ')}\n`;
      } else if (typeof val === 'string' && val) {
        ctx += `- ${key}: ${val}\n`;
      } else if (typeof val === 'boolean') {
        ctx += `- ${key}: ${val ? 'yes' : 'no'}\n`;
      }
    }
  }
  ctx += '\nIMPORTANT: Maintain consistency with the above decisions. Use the same colors, fonts, entity names, and patterns.\n';
  return ctx;
}

// ── Parallel Execution Groups ────────────────────────────────────────────────
// Defines which phases can run in parallel (independent) vs sequential (dependent)
const EXECUTION_PLAN = [
  // Wave 0: Blueprint (must run first — everything depends on this)
  { wave: 0, phases: ['blueprint'], label: 'Architecture Blueprint', sequential: true },

  // Wave 1: Independent generation (can all run in parallel)
  { wave: 1, phases: ['design', 'spec', 'business'], label: 'Core Generation (parallel)', sequential: false },

  // Wave 2: Depends on Wave 1 outputs
  { wave: 2, phases: ['backend', 'agents', 'frontend'], label: 'Implementation (parallel)', sequential: false },

  // Wave 3: Depends on everything above
  { wave: 3, phases: ['docker', 'env', 'manual', 'gitignore'], label: 'Boilerplate (parallel)', sequential: false },

  // Wave 4: Final coherence check
  { wave: 4, phases: ['coherence'], label: 'Coherence Review', sequential: true },
];

// ── CLAUDE.md Read-Back ──────────────────────────────────────────────────────
// Reads existing CLAUDE.md from a repo for iterative updates
async function readExistingClaudeMd(ghToken, org, repo) {
  if (!ghToken) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${org}/${repo}/contents/CLAUDE.md`, {
      headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
  } catch {}
  return null;
}

// ── Preflight Review ─────────────────────────────────────────────────────────
// Generates a summary of what will happen before executing
function generatePreflightReport(inf, svcs, flags) {
  const report = {
    project: {
      name: inf.name,
      slug: inf.repo,
      type: inf.type_label || inf.type_id,
      stack: inf.stack || [],
    },
    files_to_generate: [
      'DESIGN.md', 'CLAUDE.md', 'DYNASTY-DESIGN.md', 'AGENTS.md',
      'SPEC.md', 'ROADMAP.md', 'README.md', 'MANUAL-ACTIONS.md', '.env.example',
      'BUSINESS-SYSTEM.md', 'REVENUE-MODEL.md', 'GTM-PLAYBOOK.md',
      'AGENT-SYSTEM.md', 'FAILURE-MODES.md',
      'DATA-MODEL.md', 'API-CONTRACTS.md', 'KB-OUTLINES.md', 'DESIGN-DECISIONS.md',
      'backend/main.py', 'requirements.txt', 'Dockerfile', 'docker-compose.yml',
      '.gitignore',
    ],
    infrastructure: {
      github_repo: `pinohu/${inf.repo}`,
      vercel: svcs.includes('vercel') ? `${inf.repo}.vercel.app` : null,
      neon: svcs.includes('neon') ? 'Auto-linked via Vercel storage' : null,
      twentyi: svcs.includes('twentyi') ? inf.domain : null,
      stripe: svcs.includes('stripe') ? 'Product + recurring price' : null,
    },
    estimated_cost: {
      with_smart_routing: '$0.08-0.15 (Opus for architecture, Haiku for boilerplate)',
      without_smart_routing: '$0.20-0.40 (Sonnet for everything)',
    },
    estimated_time: {
      with_parallel: '~30-45 seconds',
      without_parallel: '~90-120 seconds',
    },
    flags_active: Object.entries(flags || {})
      .filter(([, v]) => v?.enabled || v === true)
      .map(([k]) => k),
  };
  return report;
}

// ── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.method === 'GET' ? req.query?.action : (req.body?.action || req.query?.action);

  // ── GET ROUTING INFO ────────────────────────────────────────────────────
  if (action === 'routing') {
    return res.json({
      tiers: ROUTING_TIERS,
      phase_tiers: PHASE_TIERS,
      execution_plan: EXECUTION_PLAN,
      note: 'Smart routing maps each build phase to the optimal model tier',
    });
  }

  // ── PREFLIGHT REVIEW ────────────────────────────────────────────────────
  if (action === 'preflight') {
    const { inf, svcs, flags } = req.body || {};
    if (!inf) return res.status(400).json({ error: 'inf (infrastructure config) required' });
    const report = generatePreflightReport(inf, svcs || [], flags || {});
    return res.json({ preflight: report });
  }

  // ── ROUTE MODEL ─────────────────────────────────────────────────────────
  if (action === 'route') {
    const { phase_id, provider, override } = req.body || {};
    const model = routeModel(phase_id || 'standard', provider || 'anthropic', override);
    const tier = PHASE_TIERS[phase_id] || 'standard';
    return res.json({ model, tier, phase_id });
  }

  // ── COMPACT PHASE OUTPUT ────────────────────────────────────────────────
  if (action === 'compact') {
    const { phase_id, output } = req.body || {};
    const compacted = compactPhaseOutput(phase_id, output);
    return res.json({ compacted });
  }

  // ── BUILD COMPACT CONTEXT ──────────────────────────────────────────────
  if (action === 'build_context') {
    const { compactions } = req.body || {};
    if (!Array.isArray(compactions)) return res.status(400).json({ error: 'compactions array required' });
    const ctx = buildCompactContext(compactions);
    return res.json({ context: ctx, token_estimate: Math.ceil(ctx.length / 4) });
  }

  // ── READ EXISTING CLAUDE.MD ─────────────────────────────────────────────
  if (action === 'read_claude_md') {
    const { repo } = req.body || {};
    if (!repo) return res.status(400).json({ error: 'repo slug required' });
    const ghToken = process.env.GITHUB_TOKEN;
    const content = await readExistingClaudeMd(ghToken, 'pinohu', repo);
    return res.json({
      found: !!content,
      content: content || null,
      length: content ? content.length : 0,
    });
  }

  // ── EXECUTION PLAN ─────────────────────────────────────────────────────
  if (action === 'plan') {
    return res.json({ execution_plan: EXECUTION_PLAN });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
