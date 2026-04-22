// api/pivot-graph.js — LangGraph.js server-side pivot review.
//
// The client-side `runPivotReview()` in app.html still works, but this
// endpoint gives you a graph-based alternative that:
//   - runs fully inside one Vercel invocation (no "page reload kills it"
//     failure mode)
//   - streams SSE updates as each node completes so the client UI has
//     real progress instead of polling per-model
//   - uses Zod-typed outputs at every node boundary (no regex parsing)
//
// Graph shape:
//   START → propose (N parallel typed calls)
//         → cross_review (N parallel typed calls)
//         → consensus (pure aggregation, no LLM)
//         → devils_critique (N parallel typed calls + synthesis)
//         → END
//
// Falls back to a noop error response if @langchain/langgraph is not
// installed (we deliberately declared it as an optional-feeling dep so that
// deploys missing it still boot other endpoints).
export const maxDuration = 300;

import { generateTyped } from './ai-sdk.js';
import { startTrace } from './_langfuse.js';

// Lazy import — keeps the cold-start light on endpoints that never hit this.
async function loadLangGraph() {
  try {
    const lg = await import('@langchain/langgraph');
    return lg;
  } catch {
    return null;
  }
}

// ── Node implementations ─────────────────────────────────────────────────────

async function nodeProposeAll(state) {
  const { idea, scorecardJSON, frameworkAnalyses, models, sseWrite } = state;
  const proposals = await Promise.all(models.map(async (m) => {
    const prompt = `You are ${m.label}, a world-class business strategist. A user described this business idea and received a viability score of ${state.composite}/10.

ORIGINAL IDEA: ${idea}

VIABILITY SCORECARD:
${scorecardJSON}

FRAMEWORK ANALYSES:
${frameworkAnalyses}

Propose ONE specific, actionable pivot that scores significantly higher. Be bold, specific, no generic advice.`;
    const out = await generateTyped({
      schemaName: 'pivot',
      prompt,
      model: m.id,
      sessionId: state.sessionId,
      userId: state.userId,
      maxTokens: 3000,
      traceName: 'pivot-graph:propose',
    });
    const r = { _model: m.label, _modelId: m.id, _weight: m.weight || 1 };
    if (out.ok) {
      Object.assign(r, out.object);
      r._ok = true;
      if (sseWrite) sseWrite({ type: 'phase1_result', model: m.label, score: out.object.predicted_composite_score, preview: out.object.pivot_description.slice(0, 200) });
    } else {
      r._ok = false;
      r._errors = out.errors;
      if (sseWrite) sseWrite({ type: 'phase1_fail', model: m.label, error: (out.errors || []).slice(0, 1).join(' ') });
    }
    return r;
  }));
  return { ...state, proposals };
}

async function nodeCrossReview(state) {
  const { proposals, models, idea, sseWrite } = state;
  const valid = proposals.filter((p) => p._ok);
  if (valid.length < 2) return { ...state, reviews: [], consensusStrength: 0 };
  const proposalList = valid.map((p, i) => `PROPOSAL ${i + 1} (by ${p._model}):\n${p.pivot_description}\nPredicted score: ${p.predicted_composite_score}\nAdvantages: ${(p.key_advantages || []).join(', ')}\nRisks: ${(p.risks || []).join(', ')}\nReasoning: ${p.reasoning}`).join('\n\n---\n\n');

  const reviews = await Promise.all(models.map(async (m, i) => {
    const myIndex = valid.findIndex((p) => p._modelId === m.id);
    const prompt = `${models.length} AI models independently analyzed a business idea and proposed pivots. You are ${m.label}. Evaluate ALL proposals objectively.

ORIGINAL IDEA: ${idea}

PROPOSALS:
${proposalList}

Vote for the BEST proposal (you CANNOT vote for your own — proposal #${myIndex + 1 || '(n/a)'}). Rate each proposal 1-10. Suggest a synthesis combining the best elements.`;
    const out = await generateTyped({
      schemaName: 'cross_review',
      prompt,
      model: m.id,
      sessionId: state.sessionId,
      userId: state.userId,
      maxTokens: 2000,
      traceName: 'pivot-graph:cross_review',
    });
    if (out.ok) {
      if (sseWrite) sseWrite({ type: 'phase2_result', model: m.label, vote: out.object.vote });
      return { _model: m.label, _weight: m.weight || 1, ...out.object };
    }
    if (sseWrite) sseWrite({ type: 'phase2_fail', model: m.label });
    return { _model: m.label, _failed: true };
  }));

  // Weighted-vote consensus strength.
  const tally = {};
  for (const p of valid) tally[p._model] = 0;
  let totalWeight = 0;
  for (const r of reviews) {
    if (r._failed) continue;
    totalWeight += r._weight || 1;
    if (r.vote && tally[r.vote] !== undefined) tally[r.vote] += r._weight || 1;
  }
  const maxVote = Math.max(0, ...Object.values(tally));
  const consensusStrength = totalWeight ? maxVote / totalWeight : 0;
  return { ...state, reviews, consensusStrength, tally };
}

function nodeConsensus(state) {
  const { proposals, reviews, tally } = state;
  const valid = proposals.filter((p) => p._ok);
  const scored = valid.map((p) => {
    const scores = [];
    for (const r of reviews || []) {
      if (r._failed || !r.ratings) continue;
      const entry = r.ratings[p._model];
      const s = entry && typeof entry === 'object' ? entry.score : entry;
      if (typeof s === 'number') scores.push(s);
    }
    return {
      ...p,
      votes: (tally && tally[p._model]) || 0,
      avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    };
  }).sort((a, b) => b.votes - a.votes || b.avgScore - a.avgScore);
  return { ...state, ranked: scored, winner: scored[0], runnerUp: scored[1] };
}

async function nodeDevilsAdvocate(state) {
  const { winner, idea, models, sseWrite } = state;
  if (!winner) return { ...state, devilsCritique: '' };
  const prompt = (modelLabel) => `You are ${modelLabel}, acting as a ruthless venture capital partner who has watched 10,000 startups fail. ZERO tolerance for optimism bias.

THE PROPOSED BUSINESS:
${winner.pivot_description}

PREDICTED SCORE: ${winner.predicted_composite_score}/10
ADVANTAGES CLAIMED: ${(winner.key_advantages || []).join(', ')}

Return ONE critique broken into 5 focused sections: market_reality, moat_weakness, revenue_fantasy, founder_blind_spot, the_killer. Be specific. Use numbers. No encouragement.`;

  const critiques = await Promise.all(models.map(async (m) => {
    const out = await generateTyped({
      schemaName: 'devils_critique',
      prompt: prompt(m.label),
      model: m.id,
      sessionId: state.sessionId,
      userId: state.userId,
      maxTokens: 2000,
      traceName: 'pivot-graph:devils',
    });
    if (out.ok) {
      if (sseWrite) sseWrite({ type: 'phase4_result', model: m.label, killer: out.object.the_killer.slice(0, 200) });
      return { model: m.label, weight: m.weight || 1, critique: out.object };
    }
    if (sseWrite) sseWrite({ type: 'phase4_fail', model: m.label });
    return null;
  }));
  const good = critiques.filter(Boolean);
  // Simple merge — take the strongest line per section across all critiques.
  const merged = {
    market_reality: good.map((c) => c.critique.market_reality).filter(Boolean).join(' ').slice(0, 1500),
    moat_weakness: good.map((c) => c.critique.moat_weakness).filter(Boolean).join(' ').slice(0, 1500),
    revenue_fantasy: good.map((c) => c.critique.revenue_fantasy).filter(Boolean).join(' ').slice(0, 1500),
    founder_blind_spot: good.map((c) => c.critique.founder_blind_spot).filter(Boolean).join(' ').slice(0, 1500),
    the_killer: good[0]?.critique.the_killer || '',
  };
  return { ...state, devilsCritique: merged, critiqueCount: good.length };
}

// ── Graph construction (uses LangGraph when available, fallback sequence otherwise) ──
async function runGraph(initialState) {
  const lg = await loadLangGraph();
  if (!lg) {
    // Graceful fallback: run nodes in the same order without LangGraph's
    // state machinery. Keeps the endpoint working in environments that
    // haven't finished npm install yet.
    let s = await nodeProposeAll(initialState);
    s = await nodeCrossReview(s);
    s = nodeConsensus(s);
    s = await nodeDevilsAdvocate(s);
    return s;
  }

  const { StateGraph, END } = lg;
  const graph = new StateGraph({
    channels: {
      idea: null, scorecardJSON: null, frameworkAnalyses: null, composite: null,
      models: null, proposals: null, reviews: null, ranked: null, winner: null,
      runnerUp: null, consensusStrength: null, tally: null, devilsCritique: null,
      critiqueCount: null, sessionId: null, userId: null, sseWrite: null,
    },
  });
  graph.addNode('propose', nodeProposeAll);
  graph.addNode('cross_review', nodeCrossReview);
  graph.addNode('consensus', nodeConsensus);
  graph.addNode('devils', nodeDevilsAdvocate);
  graph.setEntryPoint('propose');
  graph.addEdge('propose', 'cross_review');
  graph.addEdge('cross_review', 'consensus');
  graph.addEdge('consensus', 'devils');
  graph.addEdge('devils', END);
  const app = graph.compile();
  return await app.invoke(initialState);
}

// ── HTTP handler: SSE stream of graph progression ────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { idea, scorecard, frameworkAnalyses, models, sessionId, userId, stream } = req.body || {};
  if (!idea || !scorecard || !Array.isArray(models) || !models.length) {
    return res.status(400).json({ error: 'idea, scorecard, models required' });
  }

  const trace = await startTrace({ name: 'pivot-graph', sessionId, userId, metadata: { modelCount: models.length } });

  const initial = {
    idea: String(idea).slice(0, 8000),
    scorecardJSON: JSON.stringify(scorecard, null, 2).slice(0, 6000),
    frameworkAnalyses: String(frameworkAnalyses || '').slice(0, 8000),
    composite: scorecard.composite || 0,
    models: models.slice(0, 20), // hard cap
    sessionId, userId,
  };

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    const write = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    initial.sseWrite = write;
    write({ type: 'start', phases: ['propose', 'cross_review', 'consensus', 'devils'] });
    try {
      const final = await runGraph(initial);
      write({ type: 'done', winner: final.winner, runnerUp: final.runnerUp, consensusStrength: final.consensusStrength, devilsCritique: final.devilsCritique, proposalCount: (final.proposals || []).length });
    } catch (e) {
      write({ type: 'error', error: e.message || 'graph failed' });
    }
    await trace.end();
    res.end();
    return;
  }

  try {
    const final = await runGraph(initial);
    await trace.end();
    return res.json({
      ok: true,
      winner: final.winner,
      runnerUp: final.runnerUp,
      proposals: final.proposals,
      reviews: final.reviews,
      consensusStrength: final.consensusStrength,
      devilsCritique: final.devilsCritique,
      critiqueCount: final.critiqueCount,
    });
  } catch (e) {
    await trace.end();
    return res.status(500).json({ ok: false, error: e.message });
  }
}
