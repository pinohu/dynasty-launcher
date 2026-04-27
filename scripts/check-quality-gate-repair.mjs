import assert from 'node:assert/strict';
import fs from 'node:fs';

const htmlFiles = ['app.html', 'public/app.html'];

for (const file of htmlFiles) {
  const body = fs.readFileSync(file, 'utf8');
  assert.ok(body.includes('qualityFallbackDoc'), `${file} should create deterministic fallback docs before quality validation`);
  assert.ok(body.includes('scrubCriticalQualityText'), `${file} should scrub critical quality files before validation`);
  assert.ok(body.includes('runQualityValidation'), `${file} should re-run validation after repairs`);
  assert.ok(body.includes('for (let pass = 1; !vd.ok && pass <= 3; pass++)'), `${file} should retry quality repair up to three passes`);
  assert.ok(body.includes('repairedQualityPaths'), `${file} should track repaired quality paths`);
  assert.ok(body.includes('qualityDiagnostics'), `${file} should carry exact quality diagnostics to the final banner`);
  assert.ok(body.includes('fix: repair quality gate for ${path}'), `${file} should push repaired critical docs back to the repo`);
  assert.ok(body.includes("files['DESIGN.md'] = qualityFallbackDoc"), `${file} should backfill DESIGN.md`);
  assert.ok(body.includes("files['SPEC.md'] = qualityFallbackDoc"), `${file} should backfill SPEC.md`);
  assert.ok(body.includes("files['BUSINESS-SYSTEM.md'] = qualityFallbackDoc"), `${file} should backfill BUSINESS-SYSTEM.md`);
  assert.ok(body.includes("files['backend/main.py'] = scrubCriticalQualityText"), `${file} should scrub backend/main.py`);

  for (const snippet of [
    String.raw`/\[PLACEHOLDER\]/gi`,
    String.raw`/\[Generation incomplete\]/gi`,
    String.raw`/\[INSERT [^\]]+\]/gi`,
    String.raw`/\[FILL IN [^\]]+\]/gi`,
    String.raw`/\[YOUR [^\]]+ HERE\]/gi`,
    String.raw`/\[TBD\]/gi`,
    String.raw`/\[REPLACE[^\]]*\]/gi`,
    String.raw`/\[TODO\]/gi`,
    String.raw`/\bTODO:/gi`,
    String.raw`/\bFIXME:/gi`,
    String.raw`/your-domain\.com/gi`,
    String.raw`/example\.com/gi`,
    String.raw`/changeme/gi`,
    String.raw`/xxx\.xxx/gi`,
    String.raw`/\bTBD\b/g`,
    String.raw`/\[[^\]]*(COMPANY|LEGAL|NAME|DATE|TITLE|ADDRESS|EMAIL|PHONE|STATE|COUNTRY|CLIENT|CUSTOMER|SECRETARY|DIRECTOR|OFFICER)[^\]]*\]/gi`,
    String.raw`/\bSaaS Template\b/gi`,
    String.raw`/nextjs-boilerplate/gi`,
    String.raw`/\blorem ipsum\b/gi`,
    String.raw`/\bCompany Name\b/g`,
    String.raw`/\bYour Company\b/g`,
    String.raw`/\bMy Awesome SaaS\b/gi`,
  ]) {
    assert.ok(body.includes(snippet), `${file} should scrub ${snippet}`);
  }
}

const repairModule = fs.readFileSync('api/_deployment_repair.mjs', 'utf8');
for (const snippet of [
  String.raw`/\[PLACEHOLDER\]/gi`,
  String.raw`/\[Generation incomplete\]/gi`,
  String.raw`/\[INSERT [^\]]+\]/gi`,
  String.raw`/\[FILL IN [^\]]+\]/gi`,
  String.raw`/\[YOUR [^\]]+ HERE\]/gi`,
  String.raw`/\[TBD\]/gi`,
  String.raw`/\[REPLACE[^\]]*\]/gi`,
  String.raw`/\[[^\]]*(COMPANY|LEGAL|NAME|DATE|TITLE|ADDRESS|EMAIL|PHONE|STATE|COUNTRY|CLIENT|CUSTOMER|SECRETARY|DIRECTOR|OFFICER)[^\]]*\]/gi`,
  String.raw`/\bCompany Name\b/g`,
  String.raw`/\bYour Company\b/g`,
  String.raw`/\bMy Awesome SaaS\b/gi`,
  String.raw`/\blorem ipsum\b/gi`,
  String.raw`/SaaS Template/gi`,
  String.raw`/nextjs-boilerplate/gi`,
]) {
  assert.ok(repairModule.includes(snippet), `deployment repair should scrub ${snippet}`);
}

console.log('quality gate repair coverage OK');
