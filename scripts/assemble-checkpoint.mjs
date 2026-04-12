// scripts/assemble-checkpoint.mjs — merge dynastyContinueBuildFromPostMerge into app.html (run from repo root)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const appPath = path.join(root, 'app.html');

const lines = fs.readFileSync(appPath, 'utf8').split(/\n/);
const head = lines.slice(0, 6196).join('\n');

// Lines 6197–8621: build() start through merge (before window._buildFiles)
const rawBuildStart = lines.slice(6196, 8621).join('\n');
const bodyAfterResume = rawBuildStart.replace(
  /^async function build\(desc,inf\)\{\r?\n  const repo=[\s\S]*?\r?\n  try\{\r?\n/m,
  ''
);

// Post-merge tail: line 8623 through 12619 (closing brace of if(doneCount))
let tail = lines.slice(8622, 12619).join('\n');
tail = tail.replace(/\r\n/g, '\n');

const socialOld = `    // ── Generate 1-Year Social Media Calendar (all build types) ──────────
    window._socialCalendarMd = '';
    if (_v4SkipHeavy) {`;

const socialNew = `    // ── Generate 1-Year Social Media Calendar (all build types) ──────────
    if (!_res) window._socialCalendarMd = '';
    if (_res && (files['social-media/SOCIAL-MEDIA-CALENDAR.md'] || '').length > 120) {
      window._socialCalendarMd = files['social-media/SOCIAL-MEDIA-CALENDAR.md'];
      addP('social', 'Social media calendar', 'Recovered from saved session');
      setP('social', 'ok', 'Restored — skipped re-generation');
      settleEduCard({
        phaseText: '⬡ Social Media',
        titleHtml: 'Social calendar <span style="color:var(--gold)">recovered</span>',
        body: 'Using files from your saved session. Build continues from here.',
        tip: EDU_CONTENT.social.tip,
        factHtml: '<div class="edu-fact">✓ Restored from IndexedDB checkpoint</div>',
        fillWidth: '100%',
        fillOpacity: 1,
      });
    } else if (_v4SkipHeavy) {`;

if (!tail.includes(socialOld)) {
  console.error('Social block pattern not found');
  process.exit(1);
}
tail = tail.replace(socialOld, socialNew);

const videoOld = `    // ── Generate Video Walkthrough Script ───────────────────────────────
    if (_v4SkipHeavy) {
      addP('video', 'Video script', 'Skipped (Demo / Express)');
      setP('video', 'sk', 'Faster demo path');
    } else try {`;

const videoNew = `    // ── Generate Video Walkthrough Script ───────────────────────────────
    if (_res && (files['VIDEO-SCRIPT.md'] || '').length > 200) {
      addP('video', 'Video walkthrough script', 'Recovered from saved session');
      setP('video', 'ok', 'Restored — skipped re-generation');
      settleEduCard({
        phaseText: '⬡ Video Script',
        titleHtml: 'Video script <span style="color:var(--gold)">recovered</span>',
        body: 'VIDEO-SCRIPT.md restored from checkpoint.',
        tip: EDU_CONTENT.video_script.tip,
        factHtml: '<div class="edu-fact">✓ Restored from checkpoint</div>',
        fillWidth: '100%',
        fillOpacity: 1,
      });
    } else if (_v4SkipHeavy) {
      addP('video', 'Video script', 'Skipped (Demo / Express)');
      setP('video', 'sk', 'Faster demo path');
    } else try {`;

if (!tail.includes(videoOld)) {
  console.error('Video block pattern not found');
  process.exit(1);
}
tail = tail.replace(videoOld, videoNew);

const gateOpenOld = `        // ── 9. Authority conversion quality gate (iterative; optional strict halt) ──
        // Defaults favor shipping; tighten with localStorage \`dynasty_quality_threshold\` (e.g. 88–95 for QA).
        // Hard halt only if \`dynasty_authority_quality_halt\` === '1' (power users / QA).
        const _qualityThreshold = Math.max(60, Math.min(98, Number(localStorage.getItem('dynasty_quality_threshold') || '68')));`;

const gateOpenNew = `        // ── 9. Authority conversion quality gate (iterative; optional strict halt) ──
        if (!(_res && _resumeFlags.gateCompleted)) {
        // Defaults favor shipping; tighten with localStorage \`dynasty_quality_threshold\` (e.g. 88–95 for QA).
        // Hard halt only if \`dynasty_authority_quality_halt\` === '1' (power users / QA).
        const _qualityThreshold = Math.max(60, Math.min(98, Number(localStorage.getItem('dynasty_quality_threshold') || '68')));`;

if (!tail.includes(gateOpenOld)) {
  console.error('Gate open pattern not found');
  process.exit(1);
}
tail = tail.replace(gateOpenOld, gateOpenNew);

const gateCloseOld = `        }
      }

      // ── Fix auth links: /auth/login → /sign-in, /auth/signup → /sign-up ──`;

const gateCloseNew = `        }
        } else {
          addP('quality-gate', 'Authority quality gate', 'Recovered from saved session');
          setP('quality-gate', 'ok', 'Skipped re-run — using checkpointed pages');
        }
      }

      // ── Fix auth links: /auth/login → /sign-in, /auth/signup → /sign-up ──`;

if (!tail.includes(gateCloseOld)) {
  console.error('Gate close pattern not found');
  process.exit(1);
}
tail = tail.replace(gateCloseOld, gateCloseNew);

tail = tail.replace(
  `    })();

    // Authority sites: content files pushed by authority_deploy in provision.js`,
  `    })();
    try { dynastyScheduleCheckpointSave(desc, inf, { gateCompleted: true }); } catch {}

    // Authority sites: content files pushed by authority_deploy in provision.js`
);

tail = tail.replace(
  `      const fl = Object.entries(files);
      
      // File review — show what's about to be pushed`,
  `      try { dynastyScheduleCheckpointSave(desc, inf, { gateCompleted: true, prePush: true }); } catch {}
      const fl = Object.entries(files);
      
      // File review — show what's about to be pushed`
);

const catchAndAfter = lines.slice(12619).join('\n');

const helpers = `
// app.html — IndexedDB build checkpoints (resume after refresh / crash)
const DYNASTY_CKPT_DB = 'dynasty_launcher_ckpt';
const DYNASTY_CKPT_STORE = 'checkpoint';
const DYNASTY_CKPT_VER = 2;
let _dynastyCkptTimer = null;
let _dynastyCkptPending = false;

function dynastyOpenCkptDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DYNASTY_CKPT_DB, 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
    r.onupgradeneeded = () => { try { r.result.createObjectStore(DYNASTY_CKPT_STORE); } catch {} };
  });
}

async function dynastySaveBuildCheckpoint(payload) {
  const db = await dynastyOpenCkptDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DYNASTY_CKPT_STORE, 'readwrite');
    tx.objectStore(DYNASTY_CKPT_STORE).put(payload, 'active');
    tx.oncomplete = () => { try { db.close(); } catch {} resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function dynastyLoadBuildCheckpoint() {
  try {
    const db = await dynastyOpenCkptDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DYNASTY_CKPT_STORE, 'readonly');
      const q = tx.objectStore(DYNASTY_CKPT_STORE).get('active');
      q.onsuccess = () => { try { db.close(); } catch {} resolve(q.result || null); };
      q.onerror = () => reject(q.error);
    });
  } catch { return null; }
}

async function dynastyClearBuildCheckpoint() {
  try {
    const db = await dynastyOpenCkptDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DYNASTY_CKPT_STORE, 'readwrite');
      tx.objectStore(DYNASTY_CKPT_STORE).delete('active');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    try { db.close(); } catch {}
  } catch {}
}

function dynastySerializeInf(inf) {
  try { return JSON.parse(JSON.stringify(inf)); } catch { return { ...inf }; }
}

function dynastyStopCheckpointLoop() {
  if (_dynastyCkptTimer) { clearInterval(_dynastyCkptTimer); _dynastyCkptTimer = null; }
}

function dynastyEnsureCheckpointLoop(desc, inf) {
  dynastyStopCheckpointLoop();
  _dynastyCkptTimer = setInterval(() => {
    if (!window._buildInProgress || !window._buildFiles) return;
    dynastyScheduleCheckpointSave(desc, inf);
  }, 32000);
}

function dynastyScheduleCheckpointSave(desc, inf, extra) {
  if (_dynastyCkptPending) return;
  _dynastyCkptPending = true;
  const run = () => _dynastyCkptDoSave(desc, inf, extra);
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 200);
  }
}

function _dynastyCkptDoSave(desc, inf, extra) {
  _dynastyCkptPending = false;
  try {
    if (!window._buildInProgress) return;
    const files = window._buildFiles;
    if (!files || typeof files !== 'object') return;
    const keys = Object.keys(files);
    if (keys.length < 3) return;
    const payload = {
      v: DYNASTY_CKPT_VER,
      ts: Date.now(),
      desc: String(desc || ''),
      inf: dynastySerializeInf(inf),
      files: JSON.parse(JSON.stringify(files)),
      socialCalendarMd: window._socialCalendarMd || '',
      nicheConfig: typeof window._nicheConfig === 'string' ? window._nicheConfig : '',
      isAuthority: !!isAuthority,
      v2DeployTarget: V2_DEPLOY_TARGET,
      v2Category: V2_CATEGORY,
      gateCompleted: !!(extra && extra.gateCompleted),
      prePush: !!(extra && extra.prePush),
      prgs: (PRGS || []).map(p => ({ id: p.id, l: p.l, n: p.n, s: p.s, g: p.g })),
    };
    dynastySaveBuildCheckpoint(payload).catch(() => {});
  } catch {}
}

async function dynastyHasBuildCheckpoint() {
  const c = await dynastyLoadBuildCheckpoint();
  return !!(c && c.v === DYNASTY_CKPT_VER && c.inf && c.files && Object.keys(c.files).length > 5);
}

async function resumeBuildFromCheckpoint() {
  const ck = await dynastyLoadBuildCheckpoint();
  if (!ck || ck.v !== DYNASTY_CKPT_VER || !ck.inf || !ck.files) {
    alert('No recoverable build session found.');
    return;
  }
  const ok = confirm('Resume saved session for "' + (ck.inf.name || ck.inf.repo) + '"?\\n\\nSaved: ' + new Date(ck.ts).toLocaleString() + '\\nFiles: ' + Object.keys(ck.files).length + '\\n\\nContinue deploy and verification from the saved bundle.');
  if (!ok) return;
  INFERRED = ck.inf;
  try {
    const ta = document.getElementById('project-desc');
    if (ta && ck.desc) ta.value = ck.desc;
  } catch {}
  document.getElementById('config-screen').style.display = 'none';
  document.getElementById('mode-screen').style.display = 'none';
  document.getElementById('input-screen').style.display = 'block';
  await proceedToBuild(ck.desc || '', { resume: true });
}

async function dynastyContinueBuildFromPostMerge(desc, inf, files, _resumeFlags) {
  _resumeFlags = _resumeFlags || {};
  const _res = !!_resumeFlags.resume;
  const repo = \`\${ORG}/\${inf.repo}\`;
${tail}
}

`;

const bridge = `
    window._buildFiles = files;
    dynastyEnsureCheckpointLoop(desc, inf);
    dynastyScheduleCheckpointSave(desc, inf);
    await new Promise(r => setTimeout(r, 60));
    await dynastyContinueBuildFromPostMerge(desc, inf, files, { resume: false });
`;

const newBuildHeader = `async function build(desc,inf,buildOpts){
  buildOpts = buildOpts || {};
  const repo=\`\${ORG}/\${inf.repo}\`;
  try{
    if (buildOpts.resume) {
      const ck = await dynastyLoadBuildCheckpoint();
      if (!ck || ck.v !== DYNASTY_CKPT_VER) throw new Error('No valid saved session. Run a new build to create a checkpoint.');
      if (ck.inf && inf && ck.inf.repo !== inf.repo) throw new Error('Saved session is for a different repo (' + ck.inf.repo + '). Open that project or discard the checkpoint.');
      desc = ck.desc || desc;
      if (ck.inf) Object.assign(inf, ck.inf);
      INFERRED = inf;
      const files = ck.files;
      window._buildFiles = files;
      window._socialCalendarMd = ck.socialCalendarMd || '';
      if (ck.nicheConfig) window._nicheConfig = ck.nicheConfig;
      isAuthority = !!ck.isAuthority;
      if (ck.v2DeployTarget) V2_DEPLOY_TARGET = ck.v2DeployTarget;
      if (ck.v2Category) V2_CATEGORY = ck.v2Category;
      if (ck.prgs && ck.prgs.length) {
        PRGS = ck.prgs.map(p => ({ id: p.id, l: p.l, n: p.n, s: p.s, g: p.g }));
        renderProg();
      }
      dynastyEnsureCheckpointLoop(desc, inf);
      await dynastyContinueBuildFromPostMerge(desc, inf, files, {
        resume: true,
        gateCompleted: !!ck.gateCompleted,
        prePush: !!ck.prePush
      });
      return;
    }
`;

const out = head + helpers + newBuildHeader + bodyAfterResume + bridge + '\n' + catchAndAfter;

fs.writeFileSync(appPath, out, 'utf8');
console.log('OK: dynastyContinue lines ~', tail.split('\n').length, 'total app.html bytes', out.length);
