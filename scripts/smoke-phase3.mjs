// scripts/smoke-phase3.mjs — verifies Phase 3 modules import & the
// replay/resume helpers have the expected shape. No DB needed.
let failed = 0;

// 1. event-stream module loads.
try {
  const mod = await import('../agents/_lib/event-stream.mjs');
  for (const fn of ['startRun', 'appendEvent', 'completeRun', 'replay', 'context', 'runs', 'resumePacket']) {
    if (typeof mod[fn] !== 'function') throw new Error(`${fn} not exported`);
  }
  console.log('PASS event-stream.mjs exports full surface');
} catch (e) { console.error('FAIL event-stream:', e.message); failed++; }

// 2. Migration SQL is valid enough to parse (crude — look for CREATE TABLE).
try {
  const fs = await import('node:fs/promises');
  const sql = await fs.readFile('scripts/migrations/003_agent_runs.sql', 'utf8');
  if (!/create table if not exists agent_runs/i.test(sql)) throw new Error('agent_runs table missing');
  if (!/create table if not exists agent_events/i.test(sql)) throw new Error('agent_events table missing');
  if (!/insert into schema_migrations/i.test(sql)) throw new Error('migration bookkeeping missing');
  console.log('PASS 003_agent_runs.sql has expected shape');
} catch (e) { console.error('FAIL migration:', e.message); failed++; }

// 3. API endpoints export default handler.
for (const p of ['runs', 'replay', 'resume']) {
  try {
    const mod = await import(`../api/agents/${p}.js`);
    if (typeof mod.default !== 'function') throw new Error('no default export');
    console.log(`PASS api/agents/${p}.js exports handler`);
  } catch (e) { console.error(`FAIL api/agents/${p}.js:`, e.message); failed++; }
}

if (failed > 0) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll Phase 3 checks passed.');
