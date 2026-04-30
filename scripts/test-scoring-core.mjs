import { safeParseScore } from '../lib/scoring/parse.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const valid = safeParseScore({ score: 80, breakdown: { demand: 70, competition: 60, monetization: 90, feasibility: 80 }, reasoning: 'ok', confidence: 0.8 });
assert(valid.score === 80, 'valid output failed');

const invalid = safeParseScore('bad');
assert(invalid.score === 50, 'invalid should fallback');

const missing = safeParseScore({ score: 70, reasoning: 'x' });
assert(missing.score === 50, 'missing fields should fallback');

const strings = safeParseScore({ score: '85', breakdown: { demand: '8/10', competition: '70', monetization: '65', feasibility: '90' }, reasoning: 'coerced' });
assert(strings.score === 85 && strings.breakdown.demand === 80, 'string coercion failed');

const divZero = safeParseScore({ score: '1/0', breakdown: { demand: 1, competition: 1, monetization: 1, feasibility: 1 }, reasoning: 'bad' });
assert(divZero.score === 50, 'division by zero should fallback');

console.log('scoring core tests passed');
