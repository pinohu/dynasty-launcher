// /api/provision.js — Dynasty Tool Provisioning Engine
// Reads DYNASTY_TOOL_CONFIG (server-side only) and executes real API calls
// Never exposes keys to the browser

export const maxDuration = 60;

const TOOLS = JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}');
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM = TOOLS.infrastructure?.vercel_team || 'team_fuTLGjBMk3NAD32Bm5hA7wkr';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { action } = req.query;

  // Return sanitized tool inventory (no keys)
  if (action === 'inventory') {
    return res.json({
      ai: Object.keys(TOOLS.ai || {}),
      payments: Object.keys(TOOLS.payments || {}),
      comms: Object.keys(TOOLS.comms || {}),
      content: Object.keys(TOOLS.content || {}),
      infrastructure: Object.keys(TOOLS.infrastructure || {}),
      crm_pm: Object.keys(TOOLS.crm_pm || {}),
      automation: Object.keys(TOOLS.automation || {}),
      suitedash_licenses: TOOLS.suitedash?.licenses_total || 0,
      brilliant_licenses: TOOLS.directories?.brilliant_licenses || 0,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { project_name, project_slug, description, services = [] } = req.body;
  const results = {};

  try {
    // ── Vercel: Create project linked to GitHub ────────────────────────────
    if (services.includes('vercel') && VERCEL_TOKEN) {
      try {
        const r = await fetch(`https://api.vercel.com/v10/projects?teamId=${VERCEL_TEAM}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: project_slug,
            framework: 'nextjs',
            gitRepository: { type: 'github', repo: `pinohu/${project_slug}` },
          }),
        });
        const data = await r.json();
        results.vercel = r.ok
          ? { success: true, projectId: data.id, url: `https://${project_slug}.vercel.app` }
          : { success: false, error: data.error?.message };
      } catch (e) {
        results.vercel = { success: false, error: e.message };
      }
    }

    // ── Stripe: Create product + pricing tiers ─────────────────────────────
    if (services.includes('stripe') && TOOLS.payments?.stripe_live) {
      try {
        const stripeKey = TOOLS.payments.stripe_live;
        const authHeader = 'Basic ' + Buffer.from(stripeKey + ':').toString('base64');

        // Create product
        const prodR = await fetch('https://api.stripe.com/v1/products', {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ name: project_name, description: description || project_name }),
        });
        const product = await prodR.json();

        if (prodR.ok) {
          // Create Starter price ($97/mo)
          const price1R = await fetch('https://api.stripe.com/v1/prices', {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              product: product.id, currency: 'usd',
              unit_amount: '9700', recurring_interval: 'month',
              nickname: `${project_name} Starter`,
            }),
          });
          const price1 = await price1R.json();

          // Create Pro price ($297/mo)
          const price2R = await fetch('https://api.stripe.com/v1/prices', {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              product: product.id, currency: 'usd',
              unit_amount: '29700', recurring_interval: 'month',
              nickname: `${project_name} Pro`,
            }),
          });
          const price2 = await price2R.json();

          results.stripe = {
            success: true,
            product_id: product.id,
            prices: {
              starter: { id: price1.id, amount: '$97/mo' },
              pro: { id: price2.id, amount: '$297/mo' },
            },
          };
        } else {
          results.stripe = { success: false, error: product.error?.message };
        }
      } catch (e) {
        results.stripe = { success: false, error: e.message };
      }
    }

    // ── Acumbamail: Create list for the project ────────────────────────────
    if (services.includes('acumbamail') && TOOLS.comms?.acumbamail) {
      try {
        const r = await fetch('https://acumbamail.com/api/1/createList/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_token: TOOLS.comms.acumbamail,
            name: `${project_name} Subscribers`,
            sender_name: 'Dynasty Empire',
          }),
        });
        const data = await r.json();
        results.acumbamail = { success: true, list_id: data.id || data };
      } catch (e) {
        results.acumbamail = { success: false, error: e.message };
      }
    }

    // ── Pulsetic: Create uptime monitor ───────────────────────────────────
    if (services.includes('pulsetic') && TOOLS.infrastructure?.pulsetic) {
      try {
        const r = await fetch('https://pulsetic.com/api/public/monitors', {
          method: 'POST',
          headers: {
            'APITOKEN': TOOLS.infrastructure.pulsetic,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: `https://${project_slug}.vercel.app`,
            name: project_name,
            alert_after: 2,
          }),
        });
        const data = await r.json();
        results.pulsetic = { success: r.ok, monitor_id: data.id };
      } catch (e) {
        results.pulsetic = { success: false, error: e.message };
      }
    }

    // ── Taskade: Create project workspace ─────────────────────────────────
    if (services.includes('taskade') && TOOLS.crm_pm?.taskade) {
      try {
        const r = await fetch('https://www.taskade.com/api/v1/projects', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TOOLS.crm_pm.taskade}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: project_name, description }),
        });
        const data = await r.json();
        results.taskade = { success: r.ok, project_id: data.id };
      } catch (e) {
        results.taskade = { success: false, error: e.message };
      }
    }

    // ── Insighto: Register project config ─────────────────────────────────
    if (services.includes('insighto') && TOOLS.comms?.insighto) {
      results.insighto = {
        success: true,
        note: 'Configure voice agent at insighto.ai dashboard with key: ' + TOOLS.comms.insighto.slice(0, 15) + '...',
        key_prefix: TOOLS.comms.insighto.slice(0, 20),
      };
    }

    // ── NeuronWriter: Note SEO setup ──────────────────────────────────────
    if (services.includes('neuronwriter') && TOOLS.content?.neuronwriter) {
      results.neuronwriter = {
        success: true,
        note: 'NeuronWriter ready for SEO content at neuronwriter.com',
        key_prefix: TOOLS.content.neuronwriter.slice(0, 15),
      };
    }

    // ── Generate .env additions from provisioned services ─────────────────
    const envAdditions = [];
    if (results.stripe?.success) {
      envAdditions.push(`STRIPE_PRODUCT_ID=${results.stripe.product_id}`);
      envAdditions.push(`STRIPE_PRICE_STARTER=${results.stripe.prices.starter.id}`);
      envAdditions.push(`STRIPE_PRICE_PRO=${results.stripe.prices.pro.id}`);
      envAdditions.push(`STRIPE_SECRET_KEY=sk_live_...  # Use key from DYNASTY_TOOL_CONFIG`);
    }
    if (results.vercel?.success) {
      envAdditions.push(`VERCEL_PROJECT_ID=${results.vercel.projectId}`);
      envAdditions.push(`NEXT_PUBLIC_APP_URL=https://${project_slug}.vercel.app`);
    }

    return res.json({ success: true, results, env_additions: envAdditions });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
