export const maxDuration = 15;


const WAITLIST_ATTEMPTS = new Map();
const WAITLIST_MAX = 5;
const WAITLIST_WINDOW_MS = 10 * 60 * 1000;
function isWaitlistRateLimited(req) {
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  const ip = xf.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const e = WAITLIST_ATTEMPTS.get(ip);
  if (!e || now - e.start > WAITLIST_WINDOW_MS) { WAITLIST_ATTEMPTS.set(ip, { start: now, count: 1 }); return false; }
  e.count++;
  if (WAITLIST_ATTEMPTS.size > 5000) { for (const [k,v] of WAITLIST_ATTEMPTS) { if (now - v.start > WAITLIST_WINDOW_MS) WAITLIST_ATTEMPTS.delete(k); } }
  return e.count > WAITLIST_MAX;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

  const { email, name, tier_interest, source } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email required' });
  }

  const safeName = String(name || '').replace(/[<>"'&]/g, '').slice(0, 100);
  const safeTier = String(tier_interest || 'professional').slice(0, 40);
  const safeSource = String(source || 'website').slice(0, 80);
  const results = { email_added: false, telegram_sent: false, db_saved: false };

  let config = {};
  try { config = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); } catch { config = {}; }

  const acumbaKey = config.comms?.acumbamail;
  const emailitKey = process.env.EMAILIT_API_KEY || config.comms?.emailit;
  const telegramBot = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChat = process.env.TELEGRAM_CHAT_ID;

  // 1. Add to Acumbamail list (primary lead capture)
  if (acumbaKey) {
    try {
      const listName = 'Deputy Waitlist';
      const listsResp = await fetch(`https://acumbamail.com/api/1/getLists/?auth_token=${acumbaKey}&response_type=json`);
      const lists = await listsResp.json();
      let listId = null;

      if (Array.isArray(lists)) {
        const found = lists.find(l => l.name === listName || l.title === listName);
        if (found) listId = found.id || found.subscriber_list_id;
      } else if (typeof lists === 'object') {
        for (const [id, l] of Object.entries(lists)) {
          if (l.name === listName || l.title === listName) { listId = id; break; }
        }
      }

      if (!listId) {
        const createResp = await fetch('https://acumbamail.com/api/1/createList/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `auth_token=${acumbaKey}&name=${encodeURIComponent(listName)}&sender_email=${encodeURIComponent('hello@yourdeputy.com')}&company=${encodeURIComponent('Your Deputy')}`
        });
        const created = await createResp.json();
        listId = created.id || created.subscriber_list_id;
      }

      if (listId) {
        const mergeData = JSON.stringify({
          email,
          name: safeName || undefined,
          tier_interest: safeTier,
          source: safeSource,
          signup_date: new Date().toISOString().split('T')[0]
        });
        await fetch('https://acumbamail.com/api/1/addSubscriber/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `auth_token=${acumbaKey}&list_id=${listId}&merge_fields=${encodeURIComponent(mergeData)}`
        });
        results.email_added = true;
      }
    } catch (e) {
      results.acumba_note = 'Email list service temporarily unavailable';
    }
  }

  // 2. Send confirmation via Emailit (if available)
  if (emailitKey && results.email_added) {
    try {
      await fetch('https://api.emailit.com/v2/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${emailitKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Your Deputy <hello@yourdeputy.com>',
          to: email,
          subject: `You're on the list — ${safeTier === 'enterprise' ? 'Enterprise' : 'Professional'} tier early access`,
          text: `Hi ${safeName || 'there'},\n\nYou're on the waitlist for the ${safeTier === 'enterprise' ? 'Enterprise ($9,997)' : 'Professional ($4,997)'} tier of Your Deputy.\n\nWhat's coming:\n- Live payment processing (Stripe Connect)\n- Email automation sequences\n- AI chatbot widget\n- SEO content bundle\n- Analytics & heatmaps\n- And more operational integrations\n\nWe'll notify you as soon as it's ready. In the meantime, you can score your idea free or start with Foundation ($1,997) at https://yourdeputy.com\n\nBest,\nYour Deputy Team\nhttps://yourdeputy.com`
        })
      });
    } catch {}
  }

  // 3. Telegram notification (instant alert to owner)
  if (telegramBot && telegramChat) {
    try {
      const msg = `🔔 New waitlist signup\n\n📧 ${email}\n👤 ${safeName || 'No name'}\n🎯 ${safeTier}\n📍 ${safeSource}\n⏰ ${new Date().toISOString()}`;
      await fetch(`https://api.telegram.org/bot${telegramBot}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramChat, text: msg, parse_mode: 'HTML' })
      });
      results.telegram_sent = true;
    } catch {}
  }

  // 4. Save to Neon DB (if available, for backup/analytics)
  try {
    const connStr = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (connStr) {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: connStr, max: 1, idleTimeoutMillis: 5000 });
      await pool.query(`CREATE TABLE IF NOT EXISTS dynasty_waitlist (
        id SERIAL PRIMARY KEY, email TEXT NOT NULL, name TEXT, tier_interest TEXT,
        source TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(email, tier_interest)
      )`);
      await pool.query(
        'INSERT INTO dynasty_waitlist (email, name, tier_interest, source) VALUES ($1, $2, $3, $4) ON CONFLICT (email, tier_interest) DO UPDATE SET name = EXCLUDED.name, source = EXCLUDED.source',
        [email, safeName, safeTier, safeSource]
      );
      results.db_saved = true;
      await pool.end();
    }
  } catch {}

  if (!results.email_added && !results.db_saved) {
    return res.status(500).json({ ok: false, error: 'Could not save signup. Please try again or email ikeohu@dynastyempire.com directly.' });
  }

  return res.json({ ok: true, message: 'You\'re on the list! We\'ll notify you when the tier is ready.', results });
}
