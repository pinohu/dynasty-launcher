# DYNASTY LAUNCHER V2 — CLAUDE CODE BUILD SPEC

> **Run this**: `cd ~/path-to/dynasty-launcher && claude`
> Then paste: "Read CLAUDE-CODE-V2-SPEC.md and execute all phases in order. Test after each phase."

## REPO CONTEXT

- **Repo**: `pinohu/dynasty-launcher` (private)
- **Live URL**: https://dynasty-launcher.vercel.app
- **Deploy**: Auto-deploys on push to `main` via Vercel
- **Git config**: Always use `git config user.email "polycarpohu@gmail.com"` and `user.name "pinohu"`
- **Stack**: Single `index.html` + Vercel Edge Functions in `/api/`
- **Design language**: Dark theme, dynasty-gold #C9A84C accent, 8px spacing, WCAG AA
- **Access gate**: URL param `?k=DYNASTY2026` or stored session token

## CURRENT STATE (v1)

The launcher is a single-page app in `index.html` (~1,444 lines). It has:
- A free-text textarea for project descriptions
- AI inference via `/api/claude` (Anthropic only)
- 7-phase AI generation pipeline producing 23 files
- GitHub repo creation + file push
- Infrastructure provisioning (Vercel, Neon, Stripe, 20i, Acumbamail)
- Progress display with status indicators
- Done screen with file links and business summary

**Key JS globals** (top of `<script>` block):
```js
let ORG, INFERRED, PRGS, isAuthority, LAUNCH_URL, provRes;
```

**Key functions**:
- `onDescInput()` — handles textarea input, triggers inference
- `inferConfig(desc)` — calls Claude to infer project configuration
- `showPreview(inf)` — displays inferred config grid
- `build(desc, inf)` — main build pipeline (Phases 1-10)
- `ai(prompt, keys, max)` — calls `/api/claude`, parses delimited response
- `gh(path, method, body)` — GitHub API proxy
- `pushF(repo, path, content, msg)` — push file to GitHub
- `showDone(inf, repo, fc, mtasks)` — renders completion screen
- `addP/setP/renderProg` — progress list management
- `reset()` — returns to input screen

**API endpoints**:
- `POST /api/claude` — Anthropic Claude proxy (KEEP for backward compat)
- `POST /api/ai` — NEW multi-model router (28 models, 7 providers) ← just deployed
- `GET /api/ai?action=models` — returns available models with cost info
- `GET/POST /api/github?path=...` — GitHub API proxy (path-restricted to pinohu/)
- `POST /api/provision?action=...` — infrastructure provisioning
- `GET /api/health` — credential health check
- `POST /api/validate` — placeholder detection in generated files

---

## V2 CHANGES — EXECUTE IN ORDER

### PHASE 1: Add new global state + model selector

**1A. Add new globals** after the existing globals block (`let provRes=null;`):

```js
// ── V2 State ────────────────────────────────────────────────────────────────
let V2_MODE = 'quick'; // 'quick' or 'strategic'
let V2_VIEW = 'wizard'; // 'wizard' or 'scroll'
let V2_FRAMEWORKS = ['blue-ocean']; // always includes blue-ocean
let V2_SCORECARD = null;
let V2_MODEL = 'claude-sonnet-4-20250514';
let V2_MODEL_MAP = {}; // per-phase model overrides
let V2_DEPLOY_TARGET = 'backend-only'; // 'backend-only' | 'fullstack' | 'authority' | 'wordpress' | 'static'
let V2_MODELS_CACHE = null;
let V2_BUILD_COST = 0; // running cost accumulator
```

**1B. Add model loading function** (fetches available models from `/api/ai?action=models`):

```js
async function loadModels() {
  if (V2_MODELS_CACHE) return V2_MODELS_CACHE;
  try {
    const r = await fetch('/api/ai?action=models');
    V2_MODELS_CACHE = await r.json();
    return V2_MODELS_CACHE;
  } catch { return { models: {}, providers: [] }; }
}
```

**1C. Replace the `ai()` function** to route through `/api/ai` instead of `/api/claude`, with model selection:

```js
async function ai(prompt, keys, max = 8000, phaseId = null) {
  const model = (phaseId && V2_MODEL_MAP[phaseId]) || V2_MODEL;
  const r = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: max, messages: [{ role: 'user', content: prompt }] })
  });
  if (!r.ok) throw new Error('AI API ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'AI error');
  // Track cost
  if (d._cost?.estimated_cost) V2_BUILD_COST += d._cost.estimated_cost;
  const t = d.content?.find(b => b.type === 'text')?.text || '';
  if (!t) throw new Error('Empty AI response');
  return parseDelimited(t, keys);
}
```

**1D. Also add a raw AI call** for non-delimited responses (used by scorecard):

```js
async function aiRaw(prompt, max = 4000) {
  const model = V2_MODEL_MAP['strategy'] || V2_MODEL;
  const r = await fetch('/api/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: max, messages: [{ role: 'user', content: prompt }] })
  });
  if (!r.ok) throw new Error('AI API ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'AI error');
  if (d._cost?.estimated_cost) V2_BUILD_COST += d._cost.estimated_cost;
  return d.content?.find(b => b.type === 'text')?.text || '';
}
```

**Test**: Load the page. Existing quick-build flow should still work since `ai()` now defaults to Claude Sonnet 4 via `/api/ai`.

---

### PHASE 2: Mode Selection Screen (Quick vs Strategic)

**2A. Add new HTML** — Insert a new `<div id="mode-screen">` BEFORE the existing `<div id="input-screen">`:

```html
<div id="mode-screen">
  <div class="hero">
    <h1>Dynasty Business <span>System Launcher</span></h1>
    <p>Describe a business idea. Get 23 production files, infrastructure provisioning, and a deployable system — powered by your choice of AI models and strategy frameworks.</p>
  </div>

  <div class="mode-cards">
    <div class="mode-card" id="mode-quick" onclick="selectMode('quick')">
      <div class="mc-icon">⚡</div>
      <h3>Quick Build</h3>
      <p>One prompt → AI infers everything → 23 files generated and deployed. Same as v1.</p>
      <div class="mc-tag">~3 minutes</div>
    </div>
    <div class="mode-card" id="mode-strategic" onclick="selectMode('strategic')">
      <div class="mc-icon">🏛️</div>
      <h3>Strategic Build</h3>
      <p>Choose AI models, apply business frameworks (Porter's 5 Forces, 7 Powers, Blue Ocean), get a viability score, configure deployment target — then build.</p>
      <div class="mc-tag">~8 minutes · deeper analysis</div>
    </div>
  </div>

  <div class="view-toggle">
    <span class="vt-label">Layout:</span>
    <button class="vt-btn active" id="vt-wizard" onclick="selectView('wizard')">Step-by-step wizard</button>
    <button class="vt-btn" id="vt-scroll" onclick="selectView('scroll')">Single page scroll</button>
  </div>
</div>
```

**2B. Add CSS** for mode cards (add to `<style>` block):

```css
/* Mode selection */
.mode-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1.5rem}
.mode-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--rl);padding:1.5rem;cursor:pointer;transition:.15s;position:relative}
.mode-card:hover{border-color:var(--gb);background:var(--gdim)}
.mode-card.selected{border-color:var(--gold);background:var(--gdim);box-shadow:0 0 0 1px var(--gold)}
.mc-icon{font-size:28px;margin-bottom:.75rem}
.mode-card h3{font-size:16px;font-weight:600;margin-bottom:.5rem}
.mode-card p{font-size:12px;color:var(--sec);line-height:1.5}
.mc-tag{font-size:10px;color:var(--gold);margin-top:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
/* View toggle */
.view-toggle{display:flex;align-items:center;gap:8px;margin-bottom:1.5rem}
.vt-label{font-size:11px;color:var(--dim)}
.vt-btn{padding:5px 12px;background:transparent;border:1px solid var(--bdr);border-radius:var(--r);color:var(--sec);font-size:11px;cursor:pointer;transition:.12s}
.vt-btn.active{border-color:var(--gold);color:var(--gold);background:var(--gdim)}
```

**2C. Add JS** for mode/view selection:

```js
function selectMode(mode) {
  V2_MODE = mode;
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('mode-' + mode).classList.add('selected');
  // After a short delay, advance to next screen
  setTimeout(() => {
    document.getElementById('mode-screen').style.display = 'none';
    if (mode === 'quick') {
      document.getElementById('input-screen').style.display = 'block';
    } else {
      // Strategic: show input screen but with framework step coming after inference
      document.getElementById('input-screen').style.display = 'block';
    }
  }, 300);
}

function selectView(view) {
  V2_VIEW = view;
  document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('vt-' + view).classList.add('active');
}
```

**2D. Update initial screen visibility**: The mode-screen should be visible by default, input-screen hidden:

```js
// In the page initialization (after settings-btn onclick), add:
document.getElementById('input-screen').style.display = 'none';
```

**2E. Update `reset()` function** to return to mode screen:

```js
function reset() {
  INFERRED = null; PRGS = []; isAuthority = false; LAUNCH_URL = null; provRes = null;
  V2_SCORECARD = null; V2_BUILD_COST = 0;
  document.getElementById('mode-screen').style.display = 'block';
  document.getElementById('input-screen').style.display = 'none';
  document.getElementById('prog-screen').style.display = 'none';
  document.getElementById('done-screen').style.display = 'none';
  document.getElementById('done-screen').innerHTML = '';
  document.getElementById('project-desc').value = '';
  document.getElementById('preview').style.display = 'none';
  document.getElementById('err-box').style.display = 'none';
  document.getElementById('launch-btn').disabled = true;
  document.getElementById('launch-btn').textContent = 'Describe your project above to begin';
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
}
```

**Test**: Page loads → mode screen shows two cards → clicking Quick Build shows the textarea → clicking Strategic Build also shows textarea (framework step comes later). "Start over" returns to mode screen.

---

### PHASE 3: Framework Selection + Viability Scorecard

This phase adds a new screen between the input screen and the build screen, shown only in Strategic mode.

**3A. Add new HTML** — Insert `<div id="framework-screen">` AFTER `<div id="input-screen">`:

```html
<div id="framework-screen" style="display:none">
  <div class="fw-head">
    <h2>Strategy Frameworks</h2>
    <p>Select frameworks to analyze your idea against. Blue Ocean Hungry Market is always applied. Each adds depth to BUSINESS-SYSTEM.md.</p>
  </div>

  <div class="fw-grid" id="fw-grid">
    <div class="fw-card selected locked" data-fw="blue-ocean">
      <div class="fw-check">✓</div>
      <h4>🌊 Blue Ocean Hungry Market</h4>
      <p>Dynasty original. Market hunger score, blue ocean index, competitive void analysis, demand signal validation.</p>
      <div class="fw-tag">Always applied</div>
    </div>
    <div class="fw-card" data-fw="porters" onclick="toggleFramework(this,'porters')">
      <div class="fw-check">✓</div>
      <h4>🏗️ Porter's 5 Forces</h4>
      <p>Supplier power, buyer power, rivalry, substitution threat, new entry threat. Industry attractiveness composite.</p>
    </div>
    <div class="fw-card" data-fw="seven-powers" onclick="toggleFramework(this,'seven-powers')">
      <div class="fw-check">✓</div>
      <h4>⚡ 7 Powers (Helmer)</h4>
      <p>Scale economies, network effects, counter-positioning, switching costs, branding, cornered resource, process power.</p>
    </div>
    <div class="fw-card" data-fw="jtbd" onclick="toggleFramework(this,'jtbd')">
      <div class="fw-check">✓</div>
      <h4>🎯 Jobs-to-Be-Done</h4>
      <p>Functional, social, emotional jobs. Over-served vs under-served analysis. Switching triggers and hiring criteria.</p>
    </div>
    <div class="fw-card" data-fw="lean-canvas" onclick="toggleFramework(this,'lean-canvas')">
      <div class="fw-check">✓</div>
      <h4>📋 Lean Canvas</h4>
      <p>Problem, solution, key metrics, unfair advantage, channels, customer segments, cost structure, revenue streams.</p>
    </div>
  </div>

  <button class="launch" id="score-btn" onclick="scoreIdea()">Score this idea →</button>

  <div id="scorecard-wrap" style="display:none">
    <div class="scorecard" id="scorecard"></div>
    <div id="fw-deep-dives"></div>
    <button class="launch" onclick="advanceFromFrameworks()">Continue to configure →</button>
  </div>
</div>
```

**3B. Add CSS** for framework grid and scorecard:

```css
/* Framework selection */
.fw-head{margin-bottom:1.25rem}
.fw-head h2{font-size:20px;font-weight:600;margin-bottom:4px}
.fw-head p{font-size:13px;color:var(--sec)}
.fw-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:1.25rem}
.fw-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--rl);padding:1rem 1.1rem;cursor:pointer;transition:.15s;position:relative}
.fw-card:hover{border-color:var(--gb)}
.fw-card.selected{border-color:var(--gold);background:var(--gdim)}
.fw-card.locked{cursor:default;opacity:.9}
.fw-check{position:absolute;top:10px;right:10px;width:18px;height:18px;border-radius:50%;border:1.5px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:10px;color:transparent;transition:.12s}
.fw-card.selected .fw-check{background:var(--gold);border-color:var(--gold);color:var(--ink)}
.fw-card h4{font-size:13px;font-weight:600;margin-bottom:.4rem}
.fw-card p{font-size:11px;color:var(--sec);line-height:1.45}
.fw-tag{font-size:9px;color:var(--gold);margin-top:.5rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px}
/* Scorecard */
.scorecard{background:var(--card);border:1px solid var(--gb);border-radius:var(--rl);padding:1.25rem;margin:1.25rem 0}
.sc-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--gold);margin-bottom:.75rem}
.sc-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--bdr)}
.sc-row:last-child{border:none}
.sc-label{font-size:12px;color:var(--sec)}
.sc-score{font-size:13px;font-weight:600;font-family:'SF Mono',monospace}
.sc-score.high{color:var(--grn)}.sc-score.mid{color:var(--gold)}.sc-score.low{color:var(--red)}
.sc-composite{display:flex;justify-content:space-between;align-items:center;padding:10px 0;margin-top:6px;border-top:2px solid var(--gb)}
.sc-composite .sc-label{font-size:14px;font-weight:600;color:var(--tx)}
.sc-composite .sc-score{font-size:18px}
.sc-verdict{margin-top:.75rem;padding:8px 12px;border-radius:var(--r);font-size:12px;font-weight:500}
.sc-verdict.strong{background:rgba(62,207,142,0.08);border:1px solid rgba(62,207,142,0.2);color:var(--grn)}
.sc-verdict.viable{background:var(--gdim);border:1px solid var(--gb);color:var(--gold)}
.sc-verdict.weak{background:rgba(229,83,75,0.06);border:1px solid rgba(229,83,75,0.15);color:var(--red)}
/* Deep dives */
.fw-dive{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);margin-bottom:8px;overflow:hidden}
.fw-dive-header{padding:10px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
.fw-dive-header:hover{background:var(--gdim)}
.fw-dive-body{padding:0 12px 12px;font-size:11px;color:var(--sec);line-height:1.6;display:none;white-space:pre-wrap}
.fw-dive.open .fw-dive-body{display:block}
```

**3C. Add JS** for framework toggling and scorecard:

```js
function toggleFramework(el, fw) {
  if (el.classList.contains('locked')) return;
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    if (!V2_FRAMEWORKS.includes(fw)) V2_FRAMEWORKS.push(fw);
  } else {
    V2_FRAMEWORKS = V2_FRAMEWORKS.filter(f => f !== fw);
  }
}

async function scoreIdea() {
  const desc = document.getElementById('project-desc').value.trim();
  if (!desc || !INFERRED) return;
  const btn = document.getElementById('score-btn');
  btn.disabled = true; btn.textContent = 'Analyzing with ' + V2_FRAMEWORKS.length + ' frameworks…';

  const fwList = V2_FRAMEWORKS.map(f => ({
    'blue-ocean': 'Blue Ocean Hungry Market Framework (Dynasty original): Score market hunger 1-10, blue ocean index 1-10, competitive void analysis, demand signal validation',
    'porters': "Porter's 5 Forces: Score each force 1-5 (supplier power, buyer power, competitive rivalry, threat of substitution, threat of new entry). Compute industry attractiveness composite.",
    'seven-powers': '7 Powers (Hamilton Helmer): Evaluate which of the 7 powers this business can realistically achieve (Scale Economies, Network Effects, Counter-Positioning, Switching Costs, Branding, Cornered Resource, Process Power). For each, state achievable/unlikely + timeline.',
    'jtbd': 'Jobs-to-Be-Done: Identify the core functional, social, and emotional jobs. Analyze which jobs are over-served vs under-served in the current market. Identify switching triggers.',
    'lean-canvas': 'Lean Canvas: Fill out all 9 blocks — Problem (top 3), Solution, Key Metrics, Unfair Advantage, Channels, Customer Segments, Cost Structure, Revenue Streams.'
  }[f])).join('\n\n');

  try {
    const raw = await aiRaw(`You are a world-class business strategist. Analyze this business idea using the specified frameworks and return a viability scorecard.

PROJECT: ${desc}
INFERRED CONFIG: ${JSON.stringify(INFERRED, null, 2)}

FRAMEWORKS TO APPLY:
${fwList}

Return ONLY valid JSON (no markdown, no backticks, no preamble):
{
  "scores": {
    "market_hunger": { "score": 0.0, "rationale": "..." },
    "blue_ocean_index": { "score": 0.0, "rationale": "..." },
    "competitive_moat": { "score": 0.0, "rationale": "..." },
    "revenue_confidence": { "score": 0.0, "rationale": "..." },
    "mvp_feasibility": { "score": 0.0, "rationale": "..." }
  },
  "composite": 0.0,
  "verdict": "STRONG BUILD CANDIDATE or VIABLE WITH CAVEATS or NEEDS REFINEMENT",
  "risk_summary": "1-2 sentences",
  "opportunity_summary": "1-2 sentences",
  "framework_analyses": {
    "blue_ocean": "3-4 paragraph analysis...",
    ${V2_FRAMEWORKS.includes('porters') ? '"porters": "3-4 paragraph analysis with scored table...",' : ''}
    ${V2_FRAMEWORKS.includes('seven-powers') ? '"seven_powers": "3-4 paragraph analysis per power...",' : ''}
    ${V2_FRAMEWORKS.includes('jtbd') ? '"jtbd": "3-4 paragraph JTBD analysis...",' : ''}
    ${V2_FRAMEWORKS.includes('lean-canvas') ? '"lean_canvas": "Complete 9-block lean canvas...",' : ''}
  }
}

All scores are 0.0-10.0. Be honest and rigorous — do not inflate scores. Base composite on weighted average (market_hunger 25%, blue_ocean 20%, moat 20%, revenue 20%, feasibility 15%).`, 6000);

    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Invalid scorecard response');
    V2_SCORECARD = JSON.parse(m[0]);
    renderScorecard(V2_SCORECARD);
    document.getElementById('scorecard-wrap').style.display = 'block';
    btn.textContent = 'Score again ↻';
    btn.disabled = false;
  } catch (e) {
    btn.textContent = 'Scoring failed — try again';
    btn.disabled = false;
  }
}

function renderScorecard(sc) {
  const s = sc.scores;
  const cls = n => n >= 8 ? 'high' : n >= 6 ? 'mid' : 'low';
  const vcls = sc.composite >= 8 ? 'strong' : sc.composite >= 6 ? 'viable' : 'weak';

  document.getElementById('scorecard').innerHTML = `
    <div class="sc-title">Dynasty Viability Scorecard</div>
    ${Object.entries(s).map(([k, v]) => `
      <div class="sc-row">
        <span class="sc-label">${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
        <span class="sc-score ${cls(v.score)}">${v.score.toFixed(1)} / 10</span>
      </div>`).join('')}
    <div class="sc-composite">
      <span class="sc-label">Composite Score</span>
      <span class="sc-score ${cls(sc.composite)}">${sc.composite.toFixed(1)} / 10</span>
    </div>
    <div class="sc-verdict ${vcls}">
      <strong>${sc.verdict}</strong><br>
      <span style="opacity:.8">Risk: ${sc.risk_summary}</span><br>
      <span style="opacity:.8">Opportunity: ${sc.opportunity_summary}</span>
    </div>
  `;

  // Deep dives
  const dives = document.getElementById('fw-deep-dives');
  dives.innerHTML = Object.entries(sc.framework_analyses || {}).map(([k, v]) => `
    <div class="fw-dive" onclick="this.classList.toggle('open')">
      <div class="fw-dive-header">
        <span>${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Analysis</span>
        <span style="color:var(--dim);font-size:10px">▼</span>
      </div>
      <div class="fw-dive-body">${v}</div>
    </div>
  `).join('');
}

function advanceFromFrameworks() {
  document.getElementById('framework-screen').style.display = 'none';
  document.getElementById('config-screen').style.display = 'block';
}
```

**3D. Update the launch button handler** — In Strategic mode, after inference completes, show framework screen instead of building immediately:

Modify the existing launch button click handler. When `V2_MODE === 'strategic'`, after inference, show framework screen:

```js
document.getElementById('launch-btn').addEventListener('click', async () => {
  if (!INFERRED) return;
  const desc = document.getElementById('project-desc').value.trim();

  if (V2_MODE === 'strategic') {
    // Show framework screen
    document.getElementById('input-screen').style.display = 'none';
    document.getElementById('framework-screen').style.display = 'block';
    return;
  }

  // Quick build — go straight to build
  document.getElementById('input-screen').style.display = 'none';
  document.getElementById('prog-screen').style.display = 'block';
  document.getElementById('prog-title').textContent = `Building ${INFERRED.name}…`;
  PRGS = [];
  renderProg();
  await build(desc, INFERRED);
});
```

**Test**: Strategic mode → type description → click Build → framework cards appear → select frameworks → click "Score this idea" → scorecard renders with scores → click "Continue to configure" → should advance (config screen comes in Phase 4).

---

### PHASE 4: Model Selection + Deployment Target + Configuration Screen

This adds a configuration screen between framework scoring and the build. In Quick mode, this is skipped.

**4A. Add `<div id="config-screen">` AFTER the framework screen**:

```html
<div id="config-screen" style="display:none">
  <div class="cfg-head">
    <h2>Configure Build</h2>
    <p>Choose your AI model, deployment target, and review settings before generating.</p>
  </div>

  <!-- Model Selection -->
  <div class="cfg-section">
    <h3 class="cfg-label">AI Model</h3>
    <p class="cfg-desc">Select the model for all generation phases. Free models cost $0 but may produce lower quality.</p>
    <div class="model-grid" id="model-grid"></div>
    <div class="model-cost" id="model-cost">Estimated build cost: <strong>~$0.35</strong></div>

    <details class="cfg-advanced">
      <summary>Advanced: per-phase model assignment</summary>
      <p class="cfg-desc" style="margin-top:8px">Assign different models to different generation phases. Heavier models for strategy, lighter for code.</p>
      <div class="phase-models" id="phase-models">
        <!-- Populated by JS -->
      </div>
    </details>
  </div>

  <!-- Deployment Target -->
  <div class="cfg-section">
    <h3 class="cfg-label">Deployment Target</h3>
    <p class="cfg-desc">Choose what gets deployed. All options generate the full 23-file business system.</p>
    <div class="deploy-grid" id="deploy-grid">
      <div class="deploy-card selected" data-target="backend-only" onclick="selectDeploy(this,'backend-only')">
        <div class="dc-icon">📦</div>
        <h4>Backend + Docs</h4>
        <p>GitHub repo with all files. No public URL. Build frontend yourself or with Claude Code.</p>
      </div>
      <div class="deploy-card" data-target="fullstack" onclick="selectDeploy(this,'fullstack')">
        <div class="dc-icon">🌐</div>
        <h4>Full-Stack Deploy</h4>
        <p>Next.js frontend scaffolded + deployed to Vercel. Live public URL immediately.</p>
        <div class="dc-extra">+12 frontend files · ~2 min extra</div>
      </div>
      <div class="deploy-card" data-target="authority" onclick="selectDeploy(this,'authority')">
        <div class="dc-icon">📰</div>
        <h4>Authority Site</h4>
        <p>SEO-optimized content site via Ailurophobia engine. Blog + niche config + Vercel deploy.</p>
      </div>
      <div class="deploy-card" data-target="wordpress" onclick="selectDeploy(this,'wordpress')">
        <div class="dc-icon">🔧</div>
        <h4>WordPress on 20i</h4>
        <p>WordPress package provisioned on 20i with Dynasty Developer theme.</p>
      </div>
      <div class="deploy-card" data-target="static" onclick="selectDeploy(this,'static')">
        <div class="dc-icon">📄</div>
        <h4>Static Landing Page</h4>
        <p>Single HTML page deployed to Vercel or 20i. Lead capture, coming-soon, MVPs.</p>
      </div>
    </div>
  </div>

  <!-- Review -->
  <div class="cfg-section" id="cfg-review">
    <h3 class="cfg-label">Review</h3>
    <div class="inf-grid" id="cfg-inf-grid"></div>
  </div>

  <div style="display:flex;gap:10px;margin-top:1rem">
    <button class="launch" style="flex:1;background:transparent;border:1px solid var(--bdr);color:var(--sec)" onclick="backToFrameworks()">← Back</button>
    <button class="launch" style="flex:3" id="cfg-build-btn" onclick="startBuild()">Generate complete business system →</button>
  </div>
</div>
```

**4B. Add CSS** for config screen:

```css
/* Config screen */
.cfg-head{margin-bottom:1.5rem}
.cfg-head h2{font-size:20px;font-weight:600;margin-bottom:4px}
.cfg-head p{font-size:13px;color:var(--sec)}
.cfg-section{margin-bottom:1.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--bdr)}
.cfg-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--dim);margin-bottom:4px}
.cfg-desc{font-size:12px;color:var(--sec);margin-bottom:.75rem}
/* Model grid */
.model-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:6px;margin-bottom:.5rem}
.model-chip{padding:7px 10px;background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);cursor:pointer;transition:.12s;text-align:center}
.model-chip:hover{border-color:var(--gb)}
.model-chip.selected{border-color:var(--gold);background:var(--gdim)}
.model-chip.free{border-color:rgba(62,207,142,0.2)}
.model-chip.free.selected{border-color:var(--grn);background:rgba(62,207,142,0.06)}
.model-chip .mc-name{font-size:11px;font-weight:600;color:var(--tx)}
.model-chip .mc-provider{font-size:9px;color:var(--dim);text-transform:uppercase;letter-spacing:.3px}
.model-chip .mc-cost{font-size:9px;color:var(--gold);margin-top:2px}
.model-chip.free .mc-cost{color:var(--grn)}
.model-cost{font-size:11px;color:var(--dim);margin-top:4px}
.model-cost strong{color:var(--gold)}
/* Advanced per-phase */
.cfg-advanced{margin-top:.75rem}
.cfg-advanced summary{font-size:11px;color:var(--dim);cursor:pointer}
.phase-models{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.pm-row{display:flex;align-items:center;gap:6px}
.pm-row label{font-size:10px;color:var(--sec);min-width:80px}
.pm-row select{flex:1;padding:4px 6px;background:var(--panel);border:1px solid var(--bdr);border-radius:4px;color:var(--tx);font-size:10px}
/* Deploy grid */
.deploy-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.deploy-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--rl);padding:1rem;cursor:pointer;transition:.15s}
.deploy-card:hover{border-color:var(--gb)}
.deploy-card.selected{border-color:var(--gold);background:var(--gdim)}
.dc-icon{font-size:22px;margin-bottom:.5rem}
.deploy-card h4{font-size:13px;font-weight:600;margin-bottom:.3rem}
.deploy-card p{font-size:11px;color:var(--sec);line-height:1.4}
.dc-extra{font-size:9px;color:var(--gold);margin-top:.4rem}
```

**4C. Add JS** for model selection, deploy selection, and review:

```js
async function populateModels() {
  const data = await loadModels();
  const grid = document.getElementById('model-grid');
  if (!data.models) return;
  grid.innerHTML = Object.entries(data.models)
    .filter(([, m]) => m.available)
    .sort((a, b) => a[1].free === b[1].free ? 0 : a[1].free ? -1 : 1)
    .map(([id, m]) => `
      <div class="model-chip ${m.free ? 'free' : ''} ${id === V2_MODEL ? 'selected' : ''}"
           onclick="selectModel('${id}', this)" data-model="${id}" data-cost="${m.estimatedBuildCost}">
        <div class="mc-name">${m.label}</div>
        <div class="mc-provider">${m.provider}</div>
        <div class="mc-cost">${m.free ? 'FREE' : m.estimatedBuildCost}</div>
      </div>
    `).join('');
  populatePhaseModels(data.models);
}

function selectModel(id, el) {
  V2_MODEL = id;
  document.querySelectorAll('.model-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('model-cost').innerHTML = 'Estimated build cost: <strong>' + (el.dataset.cost || '~$0.00') + '</strong>';
}

function populatePhaseModels(models) {
  const phases = [
    { id: 'strategy', label: 'Strategy / Scorecard' },
    { id: 'design', label: 'Design System' },
    { id: 'docs', label: 'Product Docs' },
    { id: 'business', label: 'Business System' },
    { id: 'backend', label: 'Backend Code' },
    { id: 'frontend', label: 'Frontend Code' },
  ];
  const opts = Object.entries(models).filter(([, m]) => m.available)
    .map(([id, m]) => `<option value="${id}">${m.label}${m.free ? ' (free)' : ''}</option>`).join('');
  document.getElementById('phase-models').innerHTML = phases.map(p => `
    <div class="pm-row">
      <label>${p.label}</label>
      <select onchange="V2_MODEL_MAP['${p.id}']=this.value">
        <option value="">Use default</option>
        ${opts}
      </select>
    </div>
  `).join('');
}

function selectDeploy(el, target) {
  V2_DEPLOY_TARGET = target;
  document.querySelectorAll('.deploy-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function backToFrameworks() {
  document.getElementById('config-screen').style.display = 'none';
  document.getElementById('framework-screen').style.display = 'block';
}

function showConfigScreen() {
  // Populate models and review
  populateModels();
  // Show review grid with INFERRED data
  const grid = document.getElementById('cfg-inf-grid');
  if (INFERRED) {
    grid.innerHTML = `
      <div class="inf-item"><div class="inf-label">Project</div><div class="inf-val">${INFERRED.name}</div></div>
      <div class="inf-item"><div class="inf-label">Type</div><div class="inf-val">${INFERRED.type_label}</div></div>
      <div class="inf-item"><div class="inf-label">Revenue</div><div class="inf-val">${INFERRED.revenue_model} · ${INFERRED.price}</div></div>
      <div class="inf-item"><div class="inf-label">Stack</div><div class="inf-val">${(INFERRED.stack || []).slice(0, 4).join(', ')}</div></div>
      <div class="inf-item"><div class="inf-label">Frameworks</div><div class="inf-val">${V2_FRAMEWORKS.length} selected</div></div>
      <div class="inf-item"><div class="inf-label">Viability</div><div class="inf-val">${V2_SCORECARD ? V2_SCORECARD.composite.toFixed(1) + '/10' : 'Not scored'}</div></div>
    `;
  }
  document.getElementById('config-screen').style.display = 'block';
}

// Wire up advanceFromFrameworks to show config screen
function advanceFromFrameworks() {
  document.getElementById('framework-screen').style.display = 'none';
  showConfigScreen();
}

async function startBuild() {
  const desc = document.getElementById('project-desc').value.trim();
  document.getElementById('config-screen').style.display = 'none';
  document.getElementById('prog-screen').style.display = 'block';
  document.getElementById('prog-title').textContent = `Building ${INFERRED.name}…`;
  V2_BUILD_COST = 0;
  PRGS = [];
  renderProg();
  await build(desc, INFERRED);
}
```

**Test**: Strategic mode full flow → describe → infer → frameworks → score → configure (models load, deploy options visible) → click "Generate complete business system" → build pipeline runs.

---

### PHASE 5: Enhanced DESIGN.md Generation

Update the DESIGN.md AI prompt in the `build()` function to follow the awesome-design-md format (VoltAgent/awesome-design-md pattern).

**5A. Replace the DESIGN.md prompt** (the `g1` phase) with this enhanced version:

The prompt should instruct the AI to generate DESIGN.md following this structure (derived from awesome-design-md):

```
1. Visual Theme & Atmosphere — 3 evocative paragraphs with precise technical descriptions
2. Color Palette & Roles — Full tables: Primary, Brand, Accent, Interactive, Neutral Scale, Surface & Borders, Shadow Colors (with exact rgba values)
3. Typography Rules — Font family with fallbacks, OpenType features, full hierarchy table (12+ rows with size/weight/lineHeight/letterSpacing/features)
4. Component Stylings — Exact specs for buttons (all states), cards, badges (always pill 9999px), form inputs (6 states), navigation
5. Layout Principles — Page structure, spacing scale, grid system
6. Depth & Elevation — 6 levels from flat to modal with exact shadow values
7. Do's and Don'ts — 12 specific rules each
8. Responsive Behavior — 4 breakpoints with key changes
9. Agent Prompt Guide — Quick color reference table, 5 copy-paste-ready prompts, iteration guide
```

Find the `g1` phase in `build()` where it says `GENERATE DYNASTY EMPIRE DESIGN FILES` and update the prompt to include:

```
Generate following the awesome-design-md format (VoltAgent/awesome-design-md). Each section must be specific, evocative, and technically precise — not generic. Include exact hex values, rgba shadows, font weights, letter-spacing values, and border-radius tokens. The Visual Theme section should read like a design critic's review of the product — specific enough that an AI agent can recreate the aesthetic from description alone.
```

Also add this to the DESIGN.md prompt instructions:

```
IMPORTANT DESIGN SYSTEM RULES (from awesome-design-md best practices):
- Shadow colors should use brand-tinted rgba values (like Stripe's rgba(50,50,93,0.25)), not generic black
- Headlines should use negative letter-spacing at display sizes (progressive tightening)
- Border philosophy should be explicitly stated (whisper-weight like Notion, or pronounced like IBM)
- Every interactive component needs 6 states: default, hover, focus, active, disabled, loading
- Color roles must distinguish between: page background, card surface, primary text, secondary text, muted text, primary accent, accent hover, accent light, borders, shadows, focus ring
- Status system must define: verified/active, pending, expired/error, draft, admin — each with bg/text/border hex
```

**5B. If frameworks were selected**, append framework context to the BUSINESS-SYSTEM.md prompt:

In the `g4a` phase (BUSINESS-SYSTEM generation), prepend the scorecard data:

```js
const scorecardContext = V2_SCORECARD ? `
DYNASTY VIABILITY SCORECARD (embed this at the top of BUSINESS-SYSTEM.md):
Composite Score: ${V2_SCORECARD.composite}/10 — ${V2_SCORECARD.verdict}
${Object.entries(V2_SCORECARD.scores).map(([k,v]) => `${k}: ${v.score}/10 — ${v.rationale}`).join('\n')}
Risk: ${V2_SCORECARD.risk_summary}
Opportunity: ${V2_SCORECARD.opportunity_summary}

FRAMEWORK ANALYSES TO INCLUDE:
${Object.entries(V2_SCORECARD.framework_analyses || {}).map(([k,v]) => `## ${k.replace(/_/g,' ').toUpperCase()}\n${v}`).join('\n\n')}
` : '';
```

Then include `scorecardContext` in the business system prompt.

**Test**: Run a Strategic build with 7 Powers + Porter's selected. Check the generated BUSINESS-SYSTEM.md on GitHub — it should contain the viability scorecard and framework analyses.

---

### PHASE 6: Frontend Scaffold Generation (for Full-Stack Deploy)

When `V2_DEPLOY_TARGET === 'fullstack'`, add a new generation phase after the backend code:

**6A. Add Phase 7** in the `build()` function, after backend code generation (g5):

```js
// ── Phase 7: Frontend scaffold (full-stack deploy only) ────────────────
if (V2_DEPLOY_TARGET === 'fullstack') {
  addP('g7', 'Generating Next.js frontend scaffold', '', '⬡ Frontend');
  setP('g7', 'run');
  try {
    const fe = await ai(`GENERATE NEXT.JS 14 APP ROUTER FRONTEND SCAFFOLD. Production-ready TypeScript code. Use the design system from the project config.

${cx(desc, inf)}
Design: surface=${inf.surface}, accent=${inf.accent}, fonts=${inf.fonts}

Generate these files using ---BEGIN:key--- / ---END:key--- delimiters:

---BEGIN:layout_tsx---
// src/app/layout.tsx — Root layout with metadata, fonts, global styles
// Use Tailwind CSS, import global stylesheet
// Include proper <html> and <body> with dark/light mode support
---END:layout_tsx---

---BEGIN:page_tsx---
// src/app/page.tsx — Landing page with hero, features, pricing, CTA
// Professional design matching the accent color and surface mode
// Include at least: hero section, 3 feature cards, pricing section, footer
---END:page_tsx---

---BEGIN:dashboard_tsx---
// src/app/dashboard/page.tsx — Authenticated dashboard
// Stats cards, recent activity list, quick actions
---END:dashboard_tsx---

---BEGIN:globals_css---
// src/app/globals.css — Tailwind directives + CSS custom properties from DESIGN.md
// Include the full color system as CSS variables
---END:globals_css---

---BEGIN:tailwind_config---
// tailwind.config.ts — Extended with project colors and fonts
---END:tailwind_config---

---BEGIN:package_json---
// package.json with all dependencies (next, react, tailwindcss, etc.)
---END:package_json---

---BEGIN:next_config---
// next.config.js
---END:next_config---

---BEGIN:tsconfig---
// tsconfig.json
---END:tsconfig---
`, ['layout_tsx', 'page_tsx', 'dashboard_tsx', 'globals_css', 'tailwind_config', 'package_json', 'next_config', 'tsconfig'], 8000, 'frontend');

    // Add frontend files to the files object
    Object.assign(files, {
      'src/app/layout.tsx': fe.layout_tsx,
      'src/app/page.tsx': fe.page_tsx,
      'src/app/dashboard/page.tsx': fe.dashboard_tsx,
      'src/app/globals.css': fe.globals_css,
      'tailwind.config.ts': fe.tailwind_config,
      'package.json': fe.package_json,
      'next.config.js': fe.next_config,
      'tsconfig.json': fe.tsconfig,
    });
    setP('g7', 'ok', `${Object.keys(fe).filter(k => fe[k]).length} frontend files ready`);
  } catch (e) { setP('g7', 'er', e.message); }
}
```

**Test**: Select "Full-Stack Deploy" in config → build → should see "Generating Next.js frontend scaffold" phase → frontend files pushed to repo.

---

### PHASE 7: Build Cost Display + Final Polish

**7A. Add running cost display** to the progress screen:

Add a `<div id="build-cost">` inside the progress screen header:

```html
<div id="build-cost" style="font-size:11px;color:var(--gold);margin-top:4px;display:none">
  Cost so far: <span id="cost-val">$0.00</span>
</div>
```

In the `ai()` and `aiRaw()` functions, after updating `V2_BUILD_COST`, also update the display:

```js
const costEl = document.getElementById('build-cost');
if (costEl && V2_BUILD_COST > 0) {
  costEl.style.display = 'block';
  document.getElementById('cost-val').textContent = '$' + V2_BUILD_COST.toFixed(4);
}
```

**7B. Add build cost to done screen** — In `showDone()`, include total cost:

```js
// In the done-head section, after the existing summary:
const costNote = V2_BUILD_COST > 0 ? ` · API cost: $${V2_BUILD_COST.toFixed(4)}` : ' · API cost: $0.00 (free models)';
// Append costNote to the summary paragraph
```

**7C. Update the `inferConfig` function** to use `/api/ai` instead of `/api/claude`:

Replace:
```js
const r = await fetch('/api/claude', {
```
With:
```js
const r = await fetch('/api/ai', {
```

The body format is the same (Anthropic-compatible), so this just routes through the new multi-model endpoint using the default model.

**7D. Ensure backward compatibility**: Keep `api/claude.js` as-is for any direct calls, but all new code uses `api/ai`.

---

### PHASE 8: Testing Checklist

After all phases are complete, verify:

- [ ] Page loads → mode selection screen appears
- [ ] Quick Build → textarea → type → button activates → builds successfully → done screen shows
- [ ] Strategic Build → textarea → type → infer → framework screen shows
- [ ] All 5 framework cards render, Blue Ocean locked
- [ ] "Score this idea" → scorecard renders with 5 scores + composite + verdict
- [ ] Deep dive sections expand/collapse
- [ ] "Continue to configure" → config screen shows
- [ ] Model grid populated from `/api/ai?action=models`
- [ ] Per-phase model assignment dropdown works
- [ ] Deployment target cards selectable
- [ ] Review section shows INFERRED data + framework count + viability score
- [ ] "Generate complete business system" → full build pipeline runs
- [ ] Build cost displays and updates during generation
- [ ] Done screen shows build cost
- [ ] "Start over" returns to mode selection
- [ ] Full-stack deploy generates extra frontend files
- [ ] Authority site type triggers site factory flow
- [ ] WordPress/static triggers 20i provisioning
- [ ] All generated DESIGN.md files follow awesome-design-md format
- [ ] BUSINESS-SYSTEM.md includes scorecard + framework analyses (strategic mode)
- [ ] Passing free Groq model works end-to-end
- [ ] Passing Claude Opus works end-to-end

---

## ENVIRONMENT VARIABLES NEEDED

Add these to the dynasty-launcher Vercel project (Settings → Environment Variables):

| Variable | Required | Value |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | ✅ Already set | — |
| `GITHUB_TOKEN` | ✅ Already set | — |
| `GROQ_API_KEY` | Add now | `[GET FROM IKE - stored in Claude memory]` |
| `OPENAI_API_KEY` | Optional | Get from platform.openai.com |
| `GOOGLE_AI_KEY` | Optional | Get from aistudio.google.com |
| `DEEPSEEK_API_KEY` | Optional | Get from platform.deepseek.com |
| `MISTRAL_API_KEY` | Optional | Get from console.mistral.ai |
| `OPENROUTER_API_KEY` | Optional | Get from openrouter.ai (gives free model access) |

At minimum, add `GROQ_API_KEY` so free models are available immediately.

---

## GIT COMMIT STRATEGY

Commit after each phase:
1. `feat(v2): add multi-model state + ai() router integration`
2. `feat(v2): mode selection screen — Quick Build vs Strategic Build`
3. `feat(v2): framework selection + viability scorecard`
4. `feat(v2): model selection + deployment target + config screen`
5. `feat(v2): enhanced DESIGN.md with awesome-design-md format`
6. `feat(v2): frontend scaffold generation for full-stack deploy`
7. `feat(v2): build cost tracking + final polish`

Push after each phase to get Vercel deploy feedback.
