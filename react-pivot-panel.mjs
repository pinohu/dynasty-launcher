// Preact + htm pivot-review panel — the React-pattern pilot.
//
// No bundler: Preact is loaded from jsdelivr (already in the CSP allowlist)
// and htm provides tagged-template JSX so we don't need Babel. This proves
// the React migration pattern on one surface (the pivot review) without
// touching the rest of the builder. When the builder moves to a proper
// bundler, this component can be lifted directly — the API is React-compatible.
//
// Activated by adding `?ui=react` to the builder URL, or setting
// localStorage.dynasty_ui_react = 'true'. Default path continues to use the
// vanilla DOM renderer in app.html.
import { h, render } from 'https://cdn.jsdelivr.net/npm/preact@10.25.4/dist/preact.module.js';
import { useState, useEffect } from 'https://cdn.jsdelivr.net/npm/preact@10.25.4/hooks/dist/hooks.module.js';
import htm from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.module.js';

const html = htm.bind(h);

function StatusBadge({ status }) {
  const map = {
    waiting: { label: '⏳ Waiting', color: '#6b7280' },
    running: { label: '⟳ Analyzing...', color: '#C9A84C' },
    done: { label: '✓ Done', color: '#50C878' },
    failed: { label: '✕ Failed', color: '#F87171' },
  };
  const s = map[status] || map.waiting;
  return html`<span style=${{ color: s.color, fontSize: 11 }}>${s.label}</span>`;
}

function ModelCard({ model, state }) {
  const s = state || { status: 'waiting', score: null, confidence: 0, votes: null };
  const border = s.status === 'done' ? '#50C878' : s.status === 'failed' ? '#F87171' : s.status === 'running' ? '#C9A84C' : 'rgba(255,255,255,0.08)';
  return html`
    <div style=${{ border: `1px solid ${border}`, borderRadius: 6, padding: 8, minWidth: 140 }}>
      <div style=${{ fontSize: 16 }}>${model.icon}</div>
      <div style=${{ fontSize: 11, fontWeight: 600, color: 'var(--tx)' }}>${model.label}</div>
      <${StatusBadge} status=${s.status} />
      ${s.score != null && html`<div style=${{ fontSize: 10, color: 'var(--sec)' }}>${s.score}</div>`}
      ${s.votes != null && html`<div style=${{ fontSize: 10, color: 'var(--gold)' }}>${s.votes.toFixed(1)} pts</div>`}
      ${s.confidence != null && html`
        <div style=${{ marginTop: 4, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
          <div style=${{ width: `${(s.confidence * 100).toFixed(0)}%`, height: 3, background: '#C9A84C', borderRadius: 2, transition: 'width .3s' }}></div>
        </div>
      `}
    </div>
  `;
}

function PhaseHeader({ label, status }) {
  const color = status === 'done' ? '#50C878' : status === 'running' ? '#C9A84C' : '#6b7280';
  return html`
    <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: 12, fontWeight: 600 }}>
      <span>${label}</span>
      <span style=${{ color, fontSize: 11 }}>${status === 'done' ? 'Done' : status === 'running' ? 'Running…' : 'Waiting'}</span>
    </div>
  `;
}

function LiveLog({ entries }) {
  return html`
    <div style=${{ marginTop: 12, border: '1px solid var(--bdr)', borderRadius: 6, padding: '8px 10px', background: 'rgba(201,168,76,0.02)', maxHeight: 240, overflowY: 'auto', fontSize: 11, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
      <div style=${{ fontSize: 10, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Live review stream (React)</div>
      ${entries.map((e, i) => html`
        <div key=${i} style=${{ color: e.tone === 'ok' ? '#50C878' : e.tone === 'err' ? '#F87171' : e.tone === 'phase' ? '#C9A84C' : 'var(--sec)', padding: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          ${e.time}  ${e.msg}
        </div>
      `)}
    </div>
  `;
}

export function PivotPanel({ models, phases, modelState, logEntries }) {
  return html`
    <div class="pipeline-vis">
      <div class="pipe-title">🧠 ${models.length}-model pivot review pipeline (React pilot)</div>
      <div id="phase1" class="pipe-phase">
        <${PhaseHeader} label="Phase 1: Independent Analysis" status=${phases.p1 || 'waiting'} />
        <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
          ${models.map((m) => html`<${ModelCard} key=${m.id} model=${m} state=${modelState[m.id]} />`)}
        </div>
      </div>
      <div class="pipe-phase"><${PhaseHeader} label="Phase 2: Cross-Review" status=${phases.p2 || 'waiting'} /></div>
      <div class="pipe-phase"><${PhaseHeader} label="Phase 3: Consensus" status=${phases.p3 || 'waiting'} /></div>
      <div class="pipe-phase"><${PhaseHeader} label="Phase 4: Devil's Advocate" status=${phases.p4 || 'waiting'} /></div>
    </div>
    <${LiveLog} entries=${logEntries} />
  `;
}

// Imperative shim so app.html's existing functions (updateModelStatus, setP,
// pipeLog) can forward to Preact state without being rewritten.
const panelState = {
  models: [],
  phases: { p1: 'waiting', p2: 'waiting', p3: 'waiting', p4: 'waiting' },
  modelState: {},
  logEntries: [],
  rerender: null,
};

function Root() {
  const [, setTick] = useState(0);
  useEffect(() => {
    panelState.rerender = () => setTick((t) => t + 1);
    return () => { panelState.rerender = null; };
  }, []);
  return html`<${PivotPanel}
    models=${panelState.models}
    phases=${panelState.phases}
    modelState=${panelState.modelState}
    logEntries=${panelState.logEntries}
  />`;
}

export function mountPivotPanel(container, models) {
  panelState.models = models;
  panelState.modelState = Object.fromEntries(models.map((m) => [m.id, { status: 'waiting' }]));
  render(h(Root), container);
}

export function setPhase(phase, status) {
  panelState.phases = { ...panelState.phases, [phase]: status };
  panelState.rerender?.();
}

export function setModel(modelId, patch) {
  panelState.modelState = { ...panelState.modelState, [modelId]: { ...(panelState.modelState[modelId] || {}), ...patch } };
  panelState.rerender?.();
}

export function appendLog(msg, tone) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  panelState.logEntries = [...panelState.logEntries, { time, msg, tone }];
  panelState.rerender?.();
}
