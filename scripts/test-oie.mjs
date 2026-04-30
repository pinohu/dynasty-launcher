import { runOIE } from '../lib/oie/engine.ts';
import { collectFeedback } from '../lib/oie/feedback/collector.ts';
import { runWeightOptimization } from '../lib/oie/feedback/optimizer.ts';
import { getCurrentWeights } from '../lib/oie/scoring/base.ts';

const assert = (c, m) => { if (!c) throw new Error(m); };

const valid = await runOIE({ ideaId: 'idea-1', idea: 'AI call center', demand: 80, competition: 60, monetization: 85, feasibility: 70 });
assert(valid.finalScore >= 0 && valid.finalScore <= 100, 'valid score bounds');

const invalid = await runOIE({ ideaId: '', idea: '', demand: 1000 });
assert(invalid.fallbackUsed === true, 'invalid should fallback');

const extreme = await runOIE({ ideaId: 'idea-2', idea: 'Extreme', demand: 0, competition: 100, monetization: 0, feasibility: 100 });
assert(Number.isFinite(extreme.finalScore), 'extreme finite');

collectFeedback({ ideaId: 'idea-1', leads: 20, conversions: 5, revenue: 1000, timeToRevenue: 7 });
collectFeedback({ ideaId: 'idea-2', leads: 2, conversions: 0, revenue: 0, timeToRevenue: 60 });
const before = getCurrentWeights();
const opt = runWeightOptimization();
const after = getCurrentWeights();
assert(opt.updated === true, 'optimizer should run');
assert(JSON.stringify(before) !== JSON.stringify(after), 'weights should adapt');

console.log('oie tests passed');
