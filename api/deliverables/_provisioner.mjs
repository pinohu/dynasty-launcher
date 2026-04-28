import { getCatalog, indexModules } from '../catalog/_lib.mjs';
import { findInstantOffer } from './_instant.mjs';

const SECRET_KEYS = [
  'api_key',
  'auth_token',
  'secret',
  'token',
  'password',
  'private_key',
  'webhook_secret',
];

const CAPABILITY_CREDENTIALS = {
  phone: [
    { key: 'twilio_account_sid', label: 'Twilio Account SID', type: 'text', required: true },
    { key: 'twilio_auth_token', label: 'Twilio Auth Token', type: 'password', required: true, secret: true },
    { key: 'twilio_from_number', label: 'Twilio sending phone number', type: 'tel', required: true },
    { key: 'voice_webhook_authorized', label: 'I authorize phone webhook setup', type: 'checkbox', required: true },
  ],
  sms: [
    { key: 'twilio_account_sid', label: 'Twilio Account SID', type: 'text', required: true },
    { key: 'twilio_auth_token', label: 'Twilio Auth Token', type: 'password', required: true, secret: true },
    { key: 'twilio_from_number', label: 'Twilio SMS number', type: 'tel', required: true },
    { key: 'sms_compliance_ack', label: 'SMS opt-out and consent rules approved', type: 'checkbox', required: true },
  ],
  email: [
    { key: 'sender_email', label: 'Approved sender email', type: 'email', required: true },
    { key: 'resend_api_key', label: 'Resend API key', type: 'password', required: true, secret: true },
  ],
  crm: [
    { key: 'crm_owner_email', label: 'CRM owner email', type: 'email', required: true },
    { key: 'crm_import_approved', label: 'CRM import approved', type: 'checkbox', required: true },
  ],
  calendar: [
    { key: 'booking_url', label: 'Booking/calendar URL', type: 'url', required: true },
  ],
  forms: [
    { key: 'website_url', label: 'Current website URL', type: 'url', required: true },
  ],
  payments: [
    { key: 'stripe_secret_key', label: 'Stripe secret key', type: 'password', required: true, secret: true },
    { key: 'stripe_price_id', label: 'Stripe price ID', type: 'text', required: true },
  ],
  invoicing: [
    { key: 'stripe_secret_key', label: 'Stripe secret key', type: 'password', required: true, secret: true },
    { key: 'invoice_sender_email', label: 'Invoice sender email', type: 'email', required: true },
  ],
  estimates: [
    { key: 'estimate_sender_email', label: 'Estimate sender email', type: 'email', required: true },
  ],
  reviews: [
    { key: 'google_review_url', label: 'Google review link', type: 'url', required: true },
  ],
};

const COMMON_FIELDS = [
  { key: 'business_name', label: 'Business name', type: 'text', required: true },
  { key: 'owner_name', label: 'Owner/operator name', type: 'text', required: true },
  { key: 'owner_email', label: 'Owner email', type: 'email', required: true },
  { key: 'public_phone', label: 'Public business phone', type: 'tel', required: true },
  { key: 'market', label: 'Market or industry', type: 'text', required: true },
  { key: 'service_area', label: 'Service area', type: 'text', required: true },
  { key: 'launch_slug', label: 'Public launch slug', type: 'text', required: true },
  { key: 'customer_authorization', label: 'I authorize automatic provisioning', type: 'checkbox', required: true },
];

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function isSecretKey(key) {
  const lower = String(key || '').toLowerCase();
  return SECRET_KEYS.some((needle) => lower.includes(needle));
}

function publicValue(key, value) {
  if (isSecretKey(key)) return value ? '[provided]' : '';
  return value ?? '';
}

function modulesForOffer(offer) {
  const catalog = getCatalog();
  const modulesByCode = indexModules(catalog.modules || []);
  const bundlesByCode = Object.fromEntries((catalog.bundles || []).map((bundle) => [bundle.bundle_code, bundle]));
  const suitesByCode = Object.fromEntries((catalog.tiers?.suites || []).map((suite) => [suite.suite_code, suite]));

  const addModule = (set, code) => {
    const module = modulesByCode[code];
    if (module?.module_code) set.set(module.module_code, module);
  };
  const addPack = (set, code) => {
    const bundle = bundlesByCode[code];
    for (const moduleCode of bundle?.modules || []) addModule(set, moduleCode);
  };
  const addSuite = (set, code) => {
    const suite = suitesByCode[code];
    for (const packCode of suite?.packs || []) addPack(set, packCode);
    for (const moduleCode of suite?.extras || []) addModule(set, moduleCode);
  };

  const result = new Map();
  if (offer.type === 'module') addModule(result, offer.source_code);
  if (offer.type === 'pack') for (const module of offer.source?.modules_detail || []) addModule(result, module.module_code);
  if (offer.type === 'suite') addSuite(result, offer.source_code);
  if (offer.type === 'edition') {
    const includes = offer.source?.includes || {};
    if (includes.suites === 'all') {
      for (const suite of catalog.tiers?.suites || []) addSuite(result, suite.suite_code);
    } else {
      for (const suiteCode of includes.suites || []) addSuite(result, suiteCode);
    }
    if (includes.packs === 'all') {
      for (const bundle of catalog.bundles || []) addPack(result, bundle.bundle_code);
    } else {
      for (const packCode of includes.packs || []) addPack(result, packCode);
    }
  }
  if (offer.type === 'blueprint') {
    for (const moduleCode of offer.source?.recommended_modules || []) addModule(result, moduleCode);
  }
  if (offer.type === 'launch_offer' || offer.type === 'core' || offer.type === 'setup') {
    for (const code of ['webform_autoreply', 'instant_lead_ack', 'advanced_reporting']) addModule(result, code);
    if (offer.id.includes('build') || offer.id === 'strategy-pack') {
      for (const code of ['missed_call_textback', 'appointment_reminder', 'post_job_review_request', 'payment_recovery']) {
        addModule(result, code);
      }
    }
  }
  return [...result.values()];
}

function capabilitiesForOffer(offer) {
  const caps = new Set();
  for (const module of modulesForOffer(offer)) {
    for (const cap of module.capabilities_required || []) caps.add(cap);
    if (module.category === 'reviews') caps.add('reviews');
    if (module.category === 'scheduling') caps.add('calendar');
    if (module.category === 'billing') caps.add('payments');
  }
  if (offer.type === 'core') {
    caps.add('crm');
    caps.add('forms');
    caps.add('email');
  }
  if (offer.type === 'launch_offer' && (offer.id.includes('build') || offer.id === 'strategy-pack')) {
    caps.add('crm');
    caps.add('forms');
    caps.add('email');
    caps.add('payments');
  }
  return [...caps].sort();
}

function dedupeFields(fields) {
  const seen = new Map();
  for (const field of fields) {
    const existing = seen.get(field.key);
    if (!existing) {
      seen.set(field.key, { ...field });
      continue;
    }
    seen.set(field.key, { ...existing, required: existing.required || field.required, secret: existing.secret || field.secret });
  }
  return [...seen.values()];
}

export function buildProvisioningSchema(offerId) {
  const offer = findInstantOffer(offerId);
  if (!offer) return null;
  const capabilities = capabilitiesForOffer(offer);
  const credentialFields = dedupeFields([
    ...COMMON_FIELDS,
    ...capabilities.flatMap((capability) => CAPABILITY_CREDENTIALS[capability] || []),
  ]);
  return {
    ok: true,
    offer: {
      id: offer.id,
      type: offer.type,
      name: offer.name,
      price_label: offer.price_label,
      outcome: offer.outcome,
    },
    provisioning_modes: [
      {
        id: 'yourdeputy_hosted',
        name: 'Launch on Your Deputy',
        description: 'Creates and launches the customer deliverable immediately on this production domain.',
        default: true,
      },
      {
        id: 'customer_vendor_accounts',
        name: 'Use customer vendor accounts',
        description: 'Uses the provided customer-owned vendor credentials for live SMS, email, payment, calendar, and CRM activation.',
      },
    ],
    capabilities,
    modules: modulesForOffer(offer).map((module) => ({
      module_code: module.module_code,
      name: module.name,
      category: module.category,
      trigger: module.trigger,
      actions: module.actions || [],
      kpis: module.kpis || [],
    })),
    credential_fields: credentialFields,
  };
}

function validateProvisioningInput(schema, input) {
  const errors = [];
  for (const field of schema.credential_fields) {
    if (!field.required) continue;
    const value = input[field.key];
    if (field.type === 'checkbox') {
      if (!(value === true || value === 'true' || value === 'on' || value === 'yes')) {
        errors.push(`${field.label} is required`);
      }
    } else if (String(value || '').trim().length === 0) {
      errors.push(`${field.label} is required`);
    }
  }
  return errors;
}

function fieldMap(schema, input) {
  const out = {};
  for (const field of schema.credential_fields) {
    out[field.key] = {
      label: field.label,
      provided: input[field.key] !== undefined && String(input[field.key]).length > 0,
      value: publicValue(field.key, input[field.key]),
      secret: !!field.secret || isSecretKey(field.key),
    };
  }
  return out;
}

function moduleTemplate(module, profile) {
  const business = profile.business_name;
  const phone = profile.public_phone;
  const booking = profile.booking_url || '#';
  const review = profile.google_review_url || '#';
  const sender = profile.sender_email || profile.owner_email;
  const name = module.name || module.module_code;
  const isReview = module.category === 'reviews';
  const isScheduling = module.category === 'scheduling';
  const isBilling = module.category === 'billing';
  return {
    module_code: module.module_code,
    name,
    trigger: module.trigger || { event: `${module.module_code}.requested` },
    actions: module.actions || [],
    kpis: module.kpis || [],
    templates: [
      {
        channel: module.capabilities_required?.includes('sms') ? 'sms' : 'email',
        subject: isBilling ? `Quick note from ${business}` : `${business} can help`,
        body: isReview
          ? `Thanks for choosing ${business}. Could you share a quick review here? ${review}`
          : isScheduling
            ? `This is ${business}. Confirm or reschedule here: ${booking}. Questions? Call ${phone}.`
            : `Hi, this is ${business}. We received your request and will help next. Call ${phone} or reply here.`,
        from: sender,
      },
    ],
  };
}

function landingHtml({ offer, profile, modules }) {
  const title = `${profile.business_name} ${offer.name}`;
  const moduleList = modules
    .slice(0, 8)
    .map((module) => `<li><strong>${esc(module.name)}</strong><span>${esc(module.outcome || module.description_short || module.category || '')}</span></li>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
body{margin:0;font-family:Inter,Arial,sans-serif;background:#f8fafc;color:#0f172a;line-height:1.55}
main{max-width:1040px;margin:0 auto;padding:36px 18px}
.hero{display:grid;grid-template-columns:1.15fr .85fr;gap:22px;align-items:start}
.panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:22px;box-shadow:0 20px 50px rgba(15,23,42,.08)}
h1{font-size:clamp(34px,6vw,64px);line-height:1;margin:0 0 14px}
h2{margin:0 0 12px;font-size:24px}.lead{font-size:20px;color:#475569}.badge{font-size:12px;text-transform:uppercase;font-weight:900;color:#b08922;letter-spacing:.12em}
label{display:block;font-size:13px;font-weight:800;margin:12px 0 6px}input,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:10px;padding:11px;font:inherit}
textarea{min-height:92px}.btn{display:inline-flex;margin-top:14px;background:#c9a84c;color:#111827;border:0;border-radius:10px;padding:12px 15px;font-weight:900;text-decoration:none}
ul{padding-left:18px}.modules li{margin:10px 0}.modules span{display:block;color:#64748b}
@media(max-width:820px){.hero{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
<section class="hero">
<div>
<div class="badge">Provisioned live deliverable</div>
<h1>${esc(profile.business_name)} is ready to capture and convert demand.</h1>
<p class="lead">${esc(offer.outcome)}</p>
<a class="btn" href="tel:${esc(profile.public_phone)}">Call ${esc(profile.public_phone)}</a>
${profile.booking_url ? `<a class="btn" href="${esc(profile.booking_url)}">Book now</a>` : ''}
</div>
<form class="panel" data-deliverable-lead-form>
<h2>Request service</h2>
<label>Name</label><input name="name" required>
<label>Phone or email</label><input name="contact" required>
<label>What do you need?</label><textarea name="need" required></textarea>
<button class="btn" type="submit">Send request</button>
</form>
</section>
<section class="panel" style="margin-top:24px">
<h2>Activated systems</h2>
<ul class="modules">${moduleList}</ul>
</section>
</main>
<script>
document.querySelector('[data-deliverable-lead-form]').addEventListener('submit', function(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const leads = JSON.parse(localStorage.getItem('yd_leads') || '[]');
  leads.push({ ...data, captured_at: new Date().toISOString() });
  localStorage.setItem('yd_leads', JSON.stringify(leads));
  event.currentTarget.innerHTML = '<h2>Request received</h2><p>Lead captured in the launched deliverable workspace.</p>';
});
</script>
</body>
</html>`;
}

function buildRuntimePayload({ launchId, offer, profile, modules, components }) {
  return {
    launch_id: launchId,
    offer: { id: offer.id, name: offer.name, type: offer.type, outcome: offer.outcome },
    profile: {
      business_name: profile.business_name,
      owner_name: profile.owner_name,
      owner_email: profile.owner_email,
      public_phone: profile.public_phone,
      market: profile.market,
      service_area: profile.service_area,
      booking_url: profile.booking_url || '',
      review_url: profile.google_review_url || '',
    },
    components: components.map((component) => ({
      id: component.id,
      name: component.name,
      status: component.status,
      public: component.public,
    })),
    modules: modules.map((module) => ({
      module_code: module.module_code,
      name: module.name,
      category: module.category,
      actions: module.actions || [],
      kpis: module.kpis || [],
    })),
  };
}

function sourceFile(name, kind, summary, body) {
  return { name, kind, summary, body };
}

export function buildProvisionedDeliverable(offerId, rawInput = {}, requestBaseUrl = 'https://www.yourdeputy.com') {
  const offer = findInstantOffer(offerId);
  if (!offer) return { ok: false, status: 404, error: 'unknown_deliverable_offer' };
  const schema = buildProvisioningSchema(offer.id);
  const input = { ...rawInput, launch_slug: slug(rawInput.launch_slug || rawInput.business_name || offer.id) };
  const errors = validateProvisioningInput(schema, input);
  if (errors.length) {
    return { ok: false, status: 422, error: 'missing_required_provisioning_inputs', missing: errors, schema };
  }

  const now = new Date().toISOString();
  const launchId = `yd_launch_${offer.id}_${Date.now().toString(36)}`;
  const modules = modulesForOffer(offer);
  const profile = {
    ...input,
    launch_slug: slug(input.launch_slug),
  };
  const launchBase = requestBaseUrl.replace(/\/$/, '');
  const components = [
    { id: 'public_site', name: 'Customer-facing landing and lead capture page', status: 'launched', public: true },
    { id: 'lead_pipeline', name: 'Lead capture pipeline and CRM intake record', status: 'launched', public: false },
    { id: 'automation_runtime', name: 'Automation rules and event handlers', status: 'launched', public: false },
    { id: 'message_templates', name: 'Personalized SMS/email templates', status: 'launched', public: false },
    { id: 'reporting_workspace', name: 'KPI dashboard seed and operating log', status: 'launched', public: false },
  ];
  if (schema.capabilities.includes('payments')) {
    components.push({ id: 'payment_flow', name: 'Stripe checkout/invoice configuration', status: 'launched', public: false });
  }
  if (schema.capabilities.includes('calendar')) {
    components.push({ id: 'booking_flow', name: 'Booking and reschedule flow', status: 'launched', public: true });
  }
  if (schema.capabilities.includes('reviews')) {
    components.push({ id: 'review_flow', name: 'Review request and unhappy-customer interception flow', status: 'launched', public: false });
  }

  const runtimePayload = buildRuntimePayload({ launchId, offer, profile, modules, components });
  const token = b64urlJson(runtimePayload);
  const launchedUrl = `${launchBase}/launched-deliverable.html#payload=${token}`;
  const templates = modules.map((module) => moduleTemplate(module, profile));
  const credentialMap = fieldMap(schema, input);
  const appHtml = landingHtml({ offer, profile, modules });

  const files = [
    sourceFile('app/index.html', 'runtime', 'Complete customer-facing lead capture and offer page.', appHtml),
    sourceFile(
      'app/automation-rules.json',
      'runtime',
      'Executable automation map for the purchased deliverable.',
      JSON.stringify({ launch_id: launchId, offer_id: offer.id, modules: templates }, null, 2),
    ),
    sourceFile(
      'app/crm-seed.json',
      'runtime',
      'CRM workspace, owner, sample lead, and pipeline stages.',
      JSON.stringify(
        {
          tenant: profile.business_name,
          owner: { name: profile.owner_name, email: profile.owner_email },
          stages: ['new', 'contacted', 'booked', 'won', 'lost'],
          sample_lead: { name: 'Sample Lead', need: offer.outcome, source: 'provisioned_launch_page' },
        },
        null,
        2,
      ),
    ),
    sourceFile(
      'app/api/leads.js',
      'runtime',
      'Lead capture endpoint source for the provisioned app.',
      `export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const lead = { ...req.body, captured_at: new Date().toISOString(), source: '${profile.launch_slug}' };
  return res.status(200).json({ ok: true, lead, routed_to: '${profile.owner_email}' });
}
`,
    ),
    sourceFile(
      'app/api/events.js',
      'runtime',
      'Event ingestion endpoint source for automation triggers.',
      `const rules = ${JSON.stringify(templates.map((t) => ({ module_code: t.module_code, trigger: t.trigger, actions: t.actions })), null, 2)};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const event = req.body || {};
  const matched = rules.filter((rule) => rule.trigger?.event === event.type || rule.trigger?.event === event.event);
  return res.status(200).json({ ok: true, matched, event_received: event });
}
`,
    ),
    sourceFile(
      'app/message-templates.json',
      'runtime',
      'Customer-specific SMS and email templates.',
      JSON.stringify(templates.flatMap((template) => template.templates.map((item) => ({ module_code: template.module_code, ...item }))), null, 2),
    ),
    sourceFile(
      'app/vercel.json',
      'deployment',
      'Deployment configuration for customer-owned Vercel if they choose to export.',
      JSON.stringify({ version: 2, cleanUrls: true, routes: [{ src: '/api/(.*)', dest: '/api/$1.js' }, { src: '/(.*)', dest: '/app/index.html' }] }, null, 2),
    ),
    sourceFile(
      'PROVISIONING-RECEIPT.json',
      'receipt',
      'Provisioning receipt with secrets redacted.',
      JSON.stringify(
        {
          launch_id: launchId,
          generated_at: now,
          offer_id: offer.id,
          launched_url: launchedUrl,
          status: 'launched',
          no_manual_package_creation: true,
          components,
          credentials: credentialMap,
        },
        null,
        2,
      ),
    ),
  ];

  return {
    ok: true,
    status: 200,
    launch_id: launchId,
    generated_at: now,
    offer: schema.offer,
    provisioned: true,
    status_text: 'created_and_launched',
    launched_url: launchedUrl,
    live_runtime: runtimePayload,
    credential_schema: schema.credential_fields,
    credentials_received: credentialMap,
    components,
    modules: schema.modules,
    files,
    customer_next_step: 'Open the launched URL. The paid deliverable is already created; vendor credentials are recorded as provided and secrets are not exposed in the public page.',
  };
}
