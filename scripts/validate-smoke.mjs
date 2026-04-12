// scripts/validate-smoke.mjs — quick checks for api/validate.js (no HTTP server)
import assert from 'node:assert/strict';

async function invokeValidate(body) {
  const { default: handler } = await import('../api/validate.js');
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', body };
    const res = {
      setHeader() {},
      status() {
        return this;
      },
      json(obj) {
        resolve(obj);
        return this;
      },
      end() {
        return this;
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

const filler = 'Lorem paragraph for length. '.repeat(8);

async function main() {
  let r = await invokeValidate({
    files: { 'SPEC.md': filler, 'BUSINESS-SYSTEM.md': filler },
    projectName: 'AcmeSmokeTestCo',
    category: 'saas',
  });
  assert.equal(r.ok, false, 'expected fail when project name missing from narratives');

  const spec = `AcmeSmokeTestCo sells B2B SaaS with auth, roles, and subscription billing plans. ${filler}`;
  const biz = `AcmeSmokeTestCo operating plan summary. ${filler}`;
  r = await invokeValidate({
    files: { 'SPEC.md': spec, 'BUSINESS-SYSTEM.md': biz },
    projectName: 'AcmeSmokeTestCo',
    category: 'saas',
  });
  assert.equal(r.ok, true, `expected pass: ${JSON.stringify(r.issues)}`);

  r = await invokeValidate({
    files: {
      'SPEC.md': `SaaS Template product with auth and billing plans. AcmeSmokeTestCo. ${filler}`,
      'BUSINESS-SYSTEM.md': biz,
    },
    projectName: 'AcmeSmokeTestCo',
    category: 'saas',
  });
  assert.equal(r.ok, false, 'expected fail on template branding leak');

  console.log('validate-smoke: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
