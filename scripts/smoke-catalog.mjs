// scripts/smoke-catalog.mjs — smoke tests for api/catalog/*
// -----------------------------------------------------------------------------
// Invokes the catalog handlers directly (no HTTP server) to confirm:
//   - product/*.json loads correctly
//   - response shape is consistent
//   - filtering works
//   - marketplace gating returns 0 results today (nothing is live yet)
//   - cross-refs resolve between endpoints
//
// Run:  node scripts/smoke-catalog.mjs
// -----------------------------------------------------------------------------

import assert from 'node:assert/strict';

function invoke(handlerModule, { method = 'GET', query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const res = {
      _status: 200,
      _body: null,
      _headers: {},
      status(s) { this._status = s; return this; },
      setHeader(k, v) { this._headers[k] = v; },
      json(b) { this._body = b; resolve({ status: this._status, body: b, headers: this._headers }); return this; },
      end() { resolve({ status: this._status, body: null, headers: this._headers }); return this; },
    };
    const req = { method, query, headers: {} };
    Promise.resolve(handlerModule.default(req, res)).catch(reject);
  });
}

async function loadHandlers() {
  return {
    modules: await import('../api/catalog/modules.js'),
    bundles: await import('../api/catalog/bundles.js'),
    blueprints: await import('../api/catalog/blueprints.js'),
    personas: await import('../api/catalog/personas.js'),
    tiers: await import('../api/catalog/tiers.js'),
  };
}

function log(ok, name, detail = '') {
  const prefix = ok ? '  PASS' : '  FAIL';
  console.log(`${prefix}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  console.log('Smoke test: api/catalog/*');
  console.log('-'.repeat(60));

  const h = await loadHandlers();
  let fails = 0;

  // --- modules ---
  {
    const r = await invoke(h.modules);
    const ok = r.status === 200 && Array.isArray(r.body.modules) && r.body.count === 20;
    log(ok, 'GET /api/catalog/modules returns 20 modules', `count=${r.body.count}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.modules, { query: { marketplace: 'true' } });
    // Today: nothing is live or deployable, so marketplace view is empty by design
    const ok = r.status === 200 && r.body.count === 0 && r.body.total === 20;
    log(ok, 'modules?marketplace=true returns 0 (no live modules yet)', `count=${r.body.count}, total=${r.body.total}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.modules, { query: { category: 'lead-capture' } });
    const ok = r.status === 200 && r.body.count === 2
      && r.body.modules.every((m) => m.category === 'lead-capture');
    log(ok, 'modules?category=lead-capture returns 2 modules', `count=${r.body.count}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.modules, { query: { blueprint: 'hvac' } });
    const ok = r.status === 200 && r.body.count > 0
      && r.body.modules.every((m) => (m.recommended_for_blueprints || []).includes('hvac'));
    log(ok, 'modules?blueprint=hvac returns HVAC-recommended modules', `count=${r.body.count}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.modules, { query: { code: 'missed_call_textback' } });
    const ok = r.status === 200 && r.body.module && r.body.module.module_code === 'missed_call_textback';
    log(ok, 'modules?code=missed_call_textback returns the single module');
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.modules, { query: { code: 'nonexistent_xyz' } });
    const ok = r.status === 404;
    log(ok, 'modules?code=nonexistent_xyz returns 404', `status=${r.status}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.modules, { query: { activation_type: 'assisted' } });
    const ok = r.status === 400;
    log(ok, 'modules?activation_type=assisted is refused (standard § 8)', `status=${r.status}`);
    if (!ok) fails++;
  }

  // --- bundles ---
  {
    const r = await invoke(h.bundles);
    const ok = r.status === 200 && r.body.count === 5
      && r.body.bundles.every((b) => 'effective_status' in b)
      && Array.isArray(r.body.deferred) && r.body.deferred.length === 3;
    log(ok, 'GET /api/catalog/bundles returns 5 packs + 3 deferred', `count=${r.body.count}, deferred=${r.body.deferred.length}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.bundles, { query: { marketplace: 'true' } });
    const ok = r.status === 200 && r.body.count === 0;
    log(ok, 'bundles?marketplace=true returns 0 (all bundles effective_status=spec)', `count=${r.body.count}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.bundles, { query: { code: 'lead_capture_pack' } });
    const ok = r.status === 200 && r.body.bundle && r.body.bundle.bundle_code === 'lead_capture_pack'
      && r.body.bundle.effective_status === 'spec'
      && r.body.bundle.pricing_detail
      && r.body.bundle.pricing_detail.price_monthly === 49;
    log(ok, 'bundles?code=lead_capture_pack returns pack + $49 pricing_detail');
    if (!ok) fails++;
  }

  // --- blueprints ---
  {
    const r = await invoke(h.blueprints);
    const ok = r.status === 200 && r.body.count === 8;
    log(ok, 'GET /api/catalog/blueprints returns 8 blueprints', `count=${r.body.count}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.blueprints, { query: { code: 'hvac' } });
    const ok = r.status === 200 && r.body.blueprint && r.body.blueprint.blueprint_code === 'hvac';
    log(ok, 'blueprints?code=hvac returns the HVAC blueprint');
    if (!ok) fails++;
  }

  // --- personas ---
  {
    const r = await invoke(h.personas);
    const ok = r.status === 200 && r.body.count === 6;
    log(ok, 'GET /api/catalog/personas returns 6 personas', `count=${r.body.count}`);
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.personas, { query: { code: 'sales-coordinator' } });
    const ok = r.status === 200 && r.body.persona && r.body.persona.persona_code === 'sales-coordinator';
    log(ok, 'personas?code=sales-coordinator returns the persona');
    if (!ok) fails++;
  }

  // --- tiers ---
  {
    const r = await invoke(h.tiers);
    const ok = r.status === 200 && Array.isArray(r.body.tiers) && r.body.tiers.length === 1
      && r.body.tiers[0].tier_code === 'core'
      && Array.isArray(r.body.editions) && r.body.editions.length === 4
      && Array.isArray(r.body.suites) && r.body.suites.length === 3
      && r.body.launcher_build_handoff.status === 'RESOLVED';
    log(ok, 'GET /api/catalog/tiers returns 1 tier + 4 editions + 3 suites + RESOLVED handoff');
    if (!ok) fails++;
  }
  {
    const r = await invoke(h.tiers, { query: { view: 'commercial' } });
    const ok = r.status === 200
      && r.body.commercial_essentials
      && r.body.commercial_essentials.annual_discount_pct === 20
      && r.body.concierge_setup
      && r.body.concierge_setup.starter.delivery_mode === 'async_only';
    log(ok, 'tiers?view=commercial returns 20% annual + async-only Starter concierge');
    if (!ok) fails++;
  }

  // --- cross-ref: every bundle module_code exists in modules ---
  {
    const mods = (await invoke(h.modules)).body.modules;
    const bundles = (await invoke(h.bundles)).body.bundles;
    const codes = new Set(mods.map((m) => m.module_code));
    const missing = [];
    for (const b of bundles) {
      for (const code of (b.modules || [])) {
        if (!codes.has(code)) missing.push(`${b.bundle_code} -> ${code}`);
      }
    }
    const ok = missing.length === 0;
    log(ok, 'every bundle module_code resolves in modules endpoint', missing.length ? missing.join(', ') : 'all resolved');
    if (!ok) fails++;
  }

  // --- cross-ref: every edition's suites and packs exist ---
  {
    const tiers = (await invoke(h.tiers)).body;
    const bundles = (await invoke(h.bundles)).body.bundles;
    const bundleCodes = new Set(bundles.map((b) => b.bundle_code));
    const suiteCodes = new Set((tiers.suites || []).map((s) => s.suite_code));
    const missing = [];
    for (const ed of (tiers.editions || [])) {
      const inc = ed.includes || {};
      if (Array.isArray(inc.suites)) {
        for (const s of inc.suites) if (!suiteCodes.has(s)) missing.push(`${ed.edition_code}.suites -> ${s}`);
      }
      if (Array.isArray(inc.packs)) {
        for (const p of inc.packs) if (!bundleCodes.has(p)) missing.push(`${ed.edition_code}.packs -> ${p}`);
      }
    }
    const ok = missing.length === 0;
    log(ok, 'every edition\'s suites and packs resolve', missing.length ? missing.join(', ') : 'all resolved');
    if (!ok) fails++;
  }

  console.log('-'.repeat(60));
  if (fails === 0) {
    console.log('OK — all smoke checks passed.');
    process.exit(0);
  } else {
    console.log(`FAIL — ${fails} smoke check(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
