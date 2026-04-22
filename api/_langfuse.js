// Thin Langfuse wrapper. Returns a no-op stub when keys are absent so callers
// never have to branch on `if (process.env.LANGFUSE_*)`. Failures in tracing
// never surface to the main request — tracing is best-effort.
let _lf = null;
let _attempted = false;

async function getClient() {
  if (_attempted) return _lf;
  _attempted = true;
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';
  if (!pk || !sk) return null;
  try {
    const { Langfuse } = await import('langfuse');
    _lf = new Langfuse({ publicKey: pk, secretKey: sk, baseUrl: host, flushAt: 1 });
  } catch (e) {
    _lf = null;
  }
  return _lf;
}

// Start a trace that bundles multiple generations under one session/user.
// Returns an object with `.generation()` (one LLM call), `.end()` (finalize).
export async function startTrace({ name, sessionId, userId, metadata } = {}) {
  const lf = await getClient();
  if (!lf) return stubTrace();
  const trace = lf.trace({ name: name || 'yourdeputy', sessionId, userId, metadata });
  return {
    generation({ name, model, input, output, metadata, usage, startTime, endTime, level, statusMessage }) {
      try {
        const g = trace.generation({ name, model, input, output, metadata, usage, startTime, endTime, level, statusMessage });
        return g;
      } catch { return null; }
    },
    event({ name, input, output, metadata, level, statusMessage }) {
      try { return trace.event({ name, input, output, metadata, level, statusMessage }); } catch { return null; }
    },
    score({ name, value, comment }) {
      try { return trace.score({ name, value, comment }); } catch { return null; }
    },
    async end() {
      try { await lf.flushAsync(); } catch {}
    },
  };
}

function stubTrace() {
  return {
    generation: () => null,
    event: () => null,
    score: () => null,
    async end() {},
  };
}
