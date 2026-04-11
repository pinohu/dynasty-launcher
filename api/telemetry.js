// Your Deputy — lightweight telemetry endpoint
// Accepts anonymous product events and optionally forwards to PostHog.

const POSTHOG_KEY = process.env.POSTHOG_API_KEY || ''
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'

function sanitizeValue(value, max = 256) {
  if (value == null) return ''
  return String(value).slice(0, max)
}

function sanitizeObject(input, maxKeys = 60) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  const entries = Object.entries(input).slice(0, maxKeys)
  for (const [k, v] of entries) {
    const key = sanitizeValue(k, 64)
    if (!key) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      out[key] = typeof v === 'string' ? sanitizeValue(v, 512) : v
    else if (Array.isArray(v))
      out[key] = v.slice(0, 12).map(item => sanitizeValue(item, 128))
  }
  return out
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const body = req.body || {}
  const event = sanitizeValue(body.event, 96)
  if (!event) return res.status(400).json({ ok: false, error: 'event required' })

  const distinctId = sanitizeValue(body.distinct_id, 120) || `anon_${Date.now()}`
  const properties = sanitizeObject(body.properties || {})
  const payload = {
    event,
    distinct_id: distinctId,
    properties: {
      ...properties,
      server_ts: new Date().toISOString(),
      user_agent: sanitizeValue(req.headers['user-agent'] || '', 256),
      origin: sanitizeValue(req.headers.origin || '', 128),
      host: sanitizeValue(req.headers.host || '', 128)
    }
  }

  if (!POSTHOG_KEY) return res.json({ ok: true, forwarded: false })

  try {
    const r = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: payload.event,
        distinct_id: payload.distinct_id,
        properties: payload.properties
      })
    })
    if (!r.ok) return res.json({ ok: true, forwarded: false, status: r.status })
    return res.json({ ok: true, forwarded: true })
  } catch {
    return res.json({ ok: true, forwarded: false })
  }
}
