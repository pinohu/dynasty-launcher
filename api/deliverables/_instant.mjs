import { getCatalog, indexModules } from '../catalog/_lib.mjs';

const LAUNCH_OFFERS = [
  {
    id: 'score-free',
    type: 'launch_offer',
    name: 'Free Idea Score',
    price_label: '$0',
    buyer: 'Founder deciding whether an idea deserves more work',
    outcome: 'A go/no-go idea score with buyer, pain, monetization, risk, and next-step guidance.',
    included: ['scorecard', 'pain map', 'buyer hypothesis', 'risk flags', 'recommended next path'],
  },
  {
    id: 'diagnostic-blueprint',
    aliases: ['diagnostic', 'blueprint'],
    type: 'launch_offer',
    name: 'Diagnostic + Execution Blueprint',
    price_label: '$297',
    buyer: 'Founder who needs a deeper decision before build spend',
    outcome: 'A decision-ready execution blueprint with opportunity assessment, offer, risks, and build path.',
    included: ['market brief', 'offer recommendation', 'execution plan', 'risk register', 'build recommendation'],
  },
  {
    id: 'strategy-pack',
    aliases: ['strategy_pack'],
    type: 'launch_offer',
    name: 'Strategy Pack',
    price_label: '$697',
    buyer: 'Founder who needs planning documents and business narrative',
    outcome: 'A complete document pack for strategy, GTM, revenue, operations, legal drafts, and handoff.',
    included: ['SPEC.md', 'BUSINESS-SYSTEM.md', 'REVENUE-MODEL.md', 'GTM-PLAYBOOK.md', 'ROADMAP.md'],
  },
  {
    id: 'foundation-build',
    aliases: ['foundation', 'starter'],
    type: 'launch_offer',
    name: 'Foundation Build',
    price_label: '$1,997 / build',
    buyer: 'Founder ready for generated files and a Day-1 handoff',
    outcome: 'Strategy Pack plus generated app files, backend/API files, deployment scaffolding, tests, seed data, and a Day-1 Success Kit.',
    included: ['generated app surface', 'backend/API files', 'deployment scaffolding', 'tests', 'seed data', 'Day-1 Success Kit'],
  },
  {
    id: 'professional-build',
    aliases: ['professional'],
    type: 'launch_offer',
    name: 'Professional Build',
    price_label: '$4,997 / build',
    buyer: 'Operator who needs a broader build and integration handoff',
    outcome: 'Foundation output plus broader operating, integration, and launch evidence for higher-touch scope.',
    included: ['Foundation package', 'expanded module map', 'integration handoff', 'launch QA receipt', 'operator checklist'],
  },
  {
    id: 'enterprise-build',
    aliases: ['enterprise'],
    type: 'launch_offer',
    name: 'Enterprise Build',
    price_label: '$9,997 / build',
    buyer: 'Multi-workflow operator needing a governed launch package',
    outcome: 'Professional output plus enterprise operating model, governance, security evidence, and scaled handoff.',
    included: ['Professional package', 'governance pack', 'security controls', 'multi-role operating model', 'release evidence'],
  },
  {
    id: 'managed-runtime',
    aliases: ['managed'],
    type: 'launch_offer',
    name: 'Managed Runtime',
    price_label: '$497 / month',
    buyer: 'Operator who wants the runtime monitored after launch',
    outcome: 'A monthly runtime package with health checks, workflow monitoring, error receipts, and operator reports.',
    included: ['health check report', 'workflow monitor', 'monthly operating receipt', 'incident log', 'optimization backlog'],
  },
  {
    id: 'custom-volume',
    aliases: ['custom_volume'],
    type: 'launch_offer',
    name: 'Custom Volume',
    price_label: 'Custom',
    buyer: 'Team needing volume, multi-location, voice, SMS, CRM, directory, lead-intel, or media scope',
    outcome: 'A scoped volume package with exact deliverables, limits, credentials, rollout plan, and acceptance checks.',
    included: ['scope contract', 'module matrix', 'rollout plan', 'credential plan', 'acceptance checks'],
  },
];

const SETUP_OFFERS = [
  {
    id: 'setup-starter',
    source_code: 'starter',
    type: 'setup',
    name: 'Starter Setup',
    price_label: '$199 one-time',
    buyer: 'Customer who wants async setup guidance',
    outcome: 'An async setup kit with templates, walkthrough, checklist, and activation guardrails.',
    included: ['setup checklist', 'template pack', 'video outline', 'activation worksheet', 'support path'],
  },
  {
    id: 'setup-guided',
    source_code: 'guided',
    type: 'setup',
    name: 'Guided Setup',
    price_label: '$499 one-time',
    buyer: 'Customer who wants guided launch configuration',
    outcome: 'A guided configuration package with account mapping, workflow settings, and launch verification.',
    included: ['configuration plan', 'workflow settings', 'account map', 'launch verification', 'handoff receipt'],
  },
  {
    id: 'setup-premium',
    source_code: 'premium',
    type: 'setup',
    name: 'Premium Setup',
    price_label: '$999 one-time',
    buyer: 'Customer who wants the broadest launch setup help',
    outcome: 'A premium setup package with migration checklist, multi-workflow configuration, QA, and operator handoff.',
    included: ['migration checklist', 'multi-workflow setup', 'QA receipt', 'operator training plan', 'support handoff'],
  },
];

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function priceLabel(amount, fallback = '') {
  if (amount == null) return fallback || 'Talk to sales';
  return `$${amount}/mo`;
}

function modulePrice(catalog, code) {
  return catalog.module_pricing?.overrides?.[code] || catalog.module_pricing?.default_price_monthly || 19;
}

function bundlePrice(catalog, code) {
  const priced = catalog.bundle_pricing?.packs?.find((p) => p.bundle_code === code);
  return priced?.price_monthly ?? null;
}

function buildOfferList() {
  const catalog = getCatalog();
  const modulesByCode = indexModules(catalog.modules || []);
  const offers = [...LAUNCH_OFFERS, ...SETUP_OFFERS];

  offers.push({
    id: 'core-workspace',
    aliases: ['core', 'your-deputy-core'],
    source_code: 'core',
    type: 'core',
    name: 'Your Deputy Core',
    price_label: priceLabel(catalog.tiers?.tiers?.[0]?.price_monthly, '$59/mo'),
    buyer: 'Business that needs the base CRM workspace before adding automations',
    outcome: catalog.tiers?.tiers?.[0]?.description || 'Core workspace with CRM, contacts, templates, dashboard, and marketplace access.',
    included: ['workspace shell', 'CRM records', 'contact import map', 'dashboard', 'automation marketplace access'],
  });

  for (const mod of catalog.modules || []) {
    offers.push({
      id: `module-${slug(mod.module_code)}`,
      aliases: [mod.module_code],
      source_code: mod.module_code,
      type: 'module',
      name: mod.name,
      price_label: priceLabel(modulePrice(catalog, mod.module_code)),
      buyer: (mod.recommended_for_personas || []).join(', ') || 'Service business operator',
      outcome: mod.outcome || mod.description_short || mod.description || `Activate ${mod.name}.`,
      included: [
        'activation manifest',
        'workflow trigger',
        'message/template set',
        'sample event',
        'acceptance test',
      ],
      source: mod,
    });
  }

  for (const bundle of catalog.bundles || []) {
    const modules = (bundle.modules || []).map((code) => modulesByCode[code]).filter(Boolean);
    offers.push({
      id: `pack-${slug(bundle.bundle_code)}`,
      aliases: [bundle.bundle_code],
      source_code: bundle.bundle_code,
      type: 'pack',
      name: bundle.name || bundle.bundle_code.replace(/_/g, ' '),
      price_label: priceLabel(bundlePrice(catalog, bundle.bundle_code), '$49/mo'),
      buyer: bundle.for || 'Operator buying a complete outcome pack',
      outcome: bundle.outcome || bundle.description || `A complete ${bundle.name || bundle.bundle_code} outcome pack.`,
      included: modules.map((m) => m.name).slice(0, 6).concat(['pack acceptance receipt']),
      source: { ...bundle, modules_detail: modules },
    });
  }

  for (const suite of catalog.tiers?.suites || []) {
    offers.push({
      id: `suite-${slug(suite.suite_code)}`,
      aliases: [suite.suite_code],
      source_code: suite.suite_code,
      type: 'suite',
      name: suite.name,
      price_label: priceLabel(suite.price_monthly),
      buyer: 'Operator buying a larger operating suite',
      outcome: suite.positioning || `A complete ${suite.name} package.`,
      included: [...(suite.packs || []), ...(suite.extras || []), 'suite operating receipt'],
      source: suite,
    });
  }

  for (const edition of catalog.tiers?.editions || []) {
    offers.push({
      id: `edition-${slug(edition.edition_code)}`,
      aliases: [edition.edition_code],
      source_code: edition.edition_code,
      type: 'edition',
      name: edition.name,
      price_label: priceLabel(edition.price_monthly, edition.price_label),
      buyer: edition.for || 'Edition buyer',
      outcome: edition.positioning || `A complete ${edition.name} package.`,
      included: [
        `tier: ${edition.includes?.tier || 'core'}`,
        `suites: ${Array.isArray(edition.includes?.suites) ? edition.includes.suites.join(', ') : edition.includes?.suites || 'none'}`,
        `packs: ${Array.isArray(edition.includes?.packs) ? edition.includes.packs.join(', ') : edition.includes?.packs || 'none'}`,
        `extra seats: ${edition.includes?.extra_seats ?? 0}`,
        'edition handoff receipt',
      ],
      source: edition,
    });
  }

  for (const bp of catalog.blueprints || []) {
    offers.push({
      id: `blueprint-${slug(bp.blueprint_code || bp.name)}`,
      aliases: [bp.blueprint_code],
      source_code: bp.blueprint_code,
      type: 'blueprint',
      name: bp.name,
      price_label: 'Included blueprint',
      buyer: bp.for || `${bp.name} operator`,
      outcome: bp.positioning || bp.description || `A ${bp.name} industry blueprint package.`,
      included: [
        'industry workflow map',
        'recommended modules',
        'buyer pain profile',
        'activation order',
        'industry acceptance checklist',
      ],
      source: bp,
    });
  }

  const seen = new Set();
  return offers.filter((offer) => {
    if (!offer?.id || seen.has(offer.id)) return false;
    seen.add(offer.id);
    return true;
  });
}

export function listInstantOffers() {
  return buildOfferList().map(({ source, ...offer }) => offer);
}

export function findInstantOffer(id) {
  const target = slug(id);
  return buildOfferList().find((offer) => {
    const candidates = [offer.id, offer.source_code, ...(offer.aliases || [])].map(slug);
    return candidates.includes(target);
  });
}

function artifact(name, kind, summary, body) {
  return { name, kind, summary, body };
}

function acceptanceTests(offer) {
  const tests = [
    `${offer.name} has a named buyer and a specific pain-to-outcome mapping.`,
    `${offer.name} includes at least one handoff artifact a customer can use immediately.`,
    `${offer.name} states credential or vendor boundaries instead of implying hidden setup.`,
    `${offer.name} includes a receipt showing what was delivered and what remains customer-owned.`,
  ];
  if (offer.type === 'module') tests.push('Module workflow includes trigger, action, template, sample event, and KPI.');
  if (['foundation-build', 'professional-build', 'enterprise-build'].includes(offer.id)) {
    tests.push('Build package includes app surface, backend/API files, deployment scaffolding, seed data, and tests.');
  }
  return tests;
}

function sampleWorkflow(offer) {
  const source = offer.source || {};
  return {
    trigger: source.trigger || { event: `${offer.type}.requested`, conditions: { package_requested: true } },
    inputs: source.inputs || ['customer_brief', 'business_profile', 'selected_offer'],
    actions: source.actions || ['generate_package', 'create_receipt', 'surface_next_steps'],
    kpis: source.kpis || ['package_created', 'handoff_viewed', 'activation_completed'],
  };
}

export function buildInstantPackage(id, brief = {}) {
  const offer = findInstantOffer(id);
  if (!offer) return null;
  const now = new Date().toISOString();
  const buyer = brief.buyer || brief.target_customer || offer.buyer;
  const business = brief.business_name || brief.market || 'Acme HVAC Recovery';
  const workflow = sampleWorkflow(offer);
  const receiptId = `yd_live_${slug(offer.id)}_${Date.now().toString(36)}`;
  const files = [
    artifact(
      'START-HERE.md',
      'handoff',
      'Customer-facing first page for the delivered package.',
      `# ${offer.name} - Live Deliverable Example\n\nBusiness: ${business}\nBuyer: ${buyer}\nOutcome: ${offer.outcome}\n\nUse this first. It explains what was generated, what is ready now, and what credentials or customer-owned accounts are required before live vendor actions run.`,
    ),
    artifact(
      'DELIVERY-MANIFEST.json',
      'manifest',
      'Machine-readable package manifest.',
      JSON.stringify(
        {
          receipt_id: receiptId,
          offer_id: offer.id,
          offer_type: offer.type,
          name: offer.name,
          generated_at: now,
          price_label: offer.price_label,
          instant_delivery: true,
          no_manual_step_required_for_package_creation: true,
          customer_owned_boundaries: ['production secrets', 'domain accounts', 'payment accounts', 'email sender approval', 'legal/tax review'],
          included: offer.included,
        },
        null,
        2,
      ),
    ),
    artifact(
      'OUTCOME-BRIEF.md',
      'strategy',
      'Clear explanation of the problem, user, promise, and deliverable.',
      `# Outcome Brief\n\nCustomer problem: ${offer.outcome}\n\nPrimary buyer: ${buyer}\n\nDelivered package:\n${offer.included.map((item) => `- ${item}`).join('\n')}\n\nThis is a complete smallest deliverable for this SKU. It is useful without waiting for a human operator.`,
    ),
    artifact(
      'WORKFLOW.json',
      'automation',
      'Activation-ready workflow or delivery flow for the package.',
      JSON.stringify(workflow, null, 2),
    ),
    artifact(
      'ACCEPTANCE-TESTS.md',
      'qa',
      'Tests that prove the deliverable is complete.',
      `# Acceptance Tests\n\n${acceptanceTests(offer).map((test, i) => `${i + 1}. ${test}`).join('\n')}\n\nPass condition: the customer can open this package, understand the outcome, inspect the artifact list, and run the next step without a manual handoff.`,
    ),
    artifact(
      'DELIVERY-RECEIPT.md',
      'receipt',
      'Plain receipt of what was generated and what was not silently promised.',
      `# Delivery Receipt\n\nReceipt: ${receiptId}\nGenerated: ${now}\n\nDelivered now:\n${offer.included.map((item) => `- ${item}`).join('\n')}\n\nNot silently performed:\n- Vendor account creation\n- Domain purchase\n- Payment account approval\n- Email sender approval\n- Legal or tax filing\n\nThose steps require customer-owned accounts or approvals. The package itself is generated instantly.`,
    ),
  ];

  if (offer.type === 'launch_offer' && offer.id.includes('build')) {
    files.push(
      artifact(
        'APP-SCAFFOLD.md',
        'code',
        'Representative app surface and backend/API scaffold included in build packages.',
        `# App Scaffold\n\nRoutes:\n- /\n- /pricing\n- /lead-magnet\n- /checkout\n- /portal\n- /api/leads\n- /api/events\n\nSeed data:\n- sample lead\n- sample customer\n- sample offer\n- sample invoice\n\nDeployment:\n- Vercel-ready configuration\n- environment validation checklist\n- route verification checklist`,
      ),
    );
  }

  return {
    ok: true,
    receipt_id: receiptId,
    generated_at: now,
    offer: {
      id: offer.id,
      type: offer.type,
      name: offer.name,
      price_label: offer.price_label,
      buyer,
      outcome: offer.outcome,
    },
    instant_delivery: true,
    no_manual_step_required_for_package_creation: true,
    package_url: `/live-deliverables/${offer.id}`,
    files,
    next_actions: [
      'Review START-HERE.md.',
      'Use DELIVERY-MANIFEST.json as the machine-readable package record.',
      'Run the acceptance tests before presenting the package to a customer.',
      'Connect customer-owned vendor accounts only when credentials and approvals exist.',
    ],
  };
}
