import crypto from 'node:crypto';
import { z } from 'zod';

const SIGNAL_WEIGHTS = [
  ['lost revenue', 18],
  ['churn', 14],
  ['chargeback', 14],
  ['refund', 12],
  ['missed call', 12],
  ['slow response', 12],
  ['manual', 10],
  ['compliance', 10],
  ['invoice', 9],
  ['follow up', 9],
  ['lead', 8],
  ['booking', 8],
  ['review', 7],
  ['seo', 5],
];

const FACTORY_ENV = {
  launch: [
    'ADMIN_KEY',
    'GITHUB_TOKEN',
    'VERCEL_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'DATABASE_URL',
  ],
  operate: ['TENANT_ACTION_SECRET', 'PAYMENT_ACCESS_SECRET'],
  outreach: ['RESEND_API_KEY'],
  optional: [
    'DYNASTY_TOOL_CONFIG',
    'N8N_API_URL',
    'N8N_API_KEY',
    'SUITEDASH_API_KEY',
    'APPSUMO_PARTNER_ID',
  ],
};

export const BusinessFactoryInput = z.object({
  operator_id: z.string().min(1).default('autonomous-operator'),
  market: z.string().min(2),
  target_customer: z.string().min(2).default('owner-operated service businesses'),
  idea_seed: z.string().default(''),
  pain_signals: z.array(z.string().min(2)).min(1),
  constraints: z.array(z.string()).default([]),
  monetization_goal: z
    .enum(['lead_first', 'cash_first', 'subscription_first'])
    .default('cash_first'),
  launch_channel: z
    .enum(['seo', 'cold_email', 'paid_ads', 'affiliate', 'appsumo', 'partner'])
    .default('seo'),
  build_profile: z
    .enum(['micro_saas', 'directory', 'info_product', 'service_funnel'])
    .default('micro_saas'),
  mode: z.enum(['plan', 'dry_run', 'launch']).default('dry_run'),
  max_days_to_revenue: z.number().int().min(1).max(90).default(14),
  agent_autonomy: z.enum(['supervised', 'guarded', 'full']).default('guarded'),
  execute_external: z.boolean().default(false),
});

export const BusinessFactoryOutput = z.object({
  ok: z.literal(true),
  factory_version: z.literal('v1.0'),
  run_id: z.string(),
  status: z.enum(['ready_for_launch', 'blocked', 'planned']),
  env_validation: z.object({
    mode: z.string(),
    missing_required: z.array(z.string()),
    missing_operational: z.array(z.string()),
    missing_optional: z.array(z.string()),
    can_launch: z.boolean(),
  }),
  idea: z.record(z.any()),
  validation: z.record(z.any()),
  offer: z.record(z.any()),
  application: z.record(z.any()),
  funnel: z.record(z.any()),
  revenue: z.record(z.any()),
  automations: z.record(z.any()),
  deployment: z.record(z.any()),
  agents: z.record(z.any()),
  control: z.record(z.any()),
  launch_manifest: z.record(z.any()),
  blockers: z.array(z.string()),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slugify(value, fallback = 'business') {
  const slug = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || fallback;
}

function titleCase(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function scorePain(signals) {
  const text = signals.join(' ').toLowerCase();
  let score = 34 + signals.length * 6;
  for (const [needle, weight] of SIGNAL_WEIGHTS) {
    if (text.includes(needle)) score += weight;
  }
  return clamp(score, 0, 100);
}

function scoreIntent(signals, goal) {
  const text = signals.join(' ').toLowerCase();
  let score = goal === 'cash_first' ? 55 : 45;
  if (/pay|budget|invoice|contract|urgent|deadline|lost revenue|cost/.test(text)) score += 22;
  if (/nice to have|someday|maybe/.test(text)) score -= 20;
  return clamp(score + signals.length * 4, 0, 100);
}

function priceFromScore(score, profile) {
  if (profile === 'directory') return { setup: 997, monthly: 199, tripwire: 49 };
  if (profile === 'info_product') return { setup: 297, monthly: 29, tripwire: 19 };
  if (profile === 'service_funnel') return { setup: 1997, monthly: 497, tripwire: 97 };
  if (score >= 85) return { setup: 997, monthly: 149, tripwire: 79 };
  if (score >= 70) return { setup: 497, monthly: 99, tripwire: 49 };
  return { setup: 197, monthly: 49, tripwire: 29 };
}

function validateEnvironment(env, mode) {
  const missingRequired = FACTORY_ENV.launch.filter((key) => !env[key]);
  const missingOperational = FACTORY_ENV.operate.filter((key) => !env[key]);
  const missingOptional = [...FACTORY_ENV.outreach, ...FACTORY_ENV.optional].filter(
    (key) => !env[key],
  );
  return {
    mode,
    missing_required: mode === 'launch' ? missingRequired : [],
    missing_operational: mode === 'launch' ? missingOperational : [],
    missing_optional: missingOptional,
    can_launch: mode !== 'launch' || missingRequired.length === 0,
  };
}

function buildIdea(input, painScore, intentScore) {
  const marketSlug = slugify(input.market);
  const seed = input.idea_seed || `${titleCase(input.market)} Revenue Recovery`;
  const name =
    input.build_profile === 'directory'
      ? `${titleCase(input.market)} Verified Vendor Directory`
      : input.build_profile === 'info_product'
        ? `${titleCase(input.market)} Cash Leak Playbook`
        : input.build_profile === 'service_funnel'
          ? `${titleCase(input.market)} Revenue Recovery Sprint`
          : `${titleCase(input.market)} Revenue OS`;

  return {
    name,
    slug: slugify(name),
    seed,
    market: input.market,
    target_customer: input.target_customer,
    build_profile: input.build_profile,
    thesis: `${name} converts urgent ${input.market} pain into a lead magnet, paid diagnostic, and recurring operating system.`,
    ranked_concepts: [
      {
        rank: 1,
        concept: name,
        why_now: 'Pain signals show active revenue leakage, making a money-first launch credible.',
        score: Math.round(painScore * 0.58 + intentScore * 0.42),
      },
      {
        rank: 2,
        concept: `${titleCase(input.market)} Follow-Up Automation Kit`,
        why_now:
          'Automation solves delayed response and missed follow-up with low delivery complexity.',
        score: clamp(Math.round(painScore * 0.5 + 26), 0, 100),
      },
      {
        rank: 3,
        concept: `${titleCase(input.market)} Operator Benchmark Report`,
        why_now: 'A report can monetize early traffic before the full app is shipped.',
        score: clamp(Math.round(intentScore * 0.45 + 32), 0, 100),
      },
    ],
    repo_name: `${marketSlug}-${slugify(input.build_profile)}-factory`,
  };
}

function buildValidation(input, painScore, intentScore) {
  const evidence = input.pain_signals.map((signal, index) => ({
    id: `signal_${index + 1}`,
    signal,
    type: /pay|budget|invoice|contract|urgent|deadline|lost revenue|cost/i.test(signal)
      ? 'purchase_intent'
      : 'pain',
    confidence: /lost revenue|urgent|deadline|invoice|pay/i.test(signal) ? 0.86 : 0.68,
  }));
  const demandScore = clamp(Math.round(painScore * 0.55 + intentScore * 0.45), 0, 100);
  const blockers = [];
  if (painScore < 55) blockers.push('pain_score_below_revenue_threshold');
  if (intentScore < 55) blockers.push('purchase_intent_below_launch_threshold');
  if (input.max_days_to_revenue > 30) blockers.push('money_first_window_too_loose');

  return {
    demand_score: demandScore,
    pain_score: painScore,
    purchase_intent_score: intentScore,
    verdict: blockers.length === 0 ? 'validate_and_launch' : 'validate_before_build',
    evidence,
    pain_point_extraction: input.pain_signals.map((signal) => ({
      raw_signal: signal,
      extracted_job: signal.replace(/\.$/, ''),
      revenue_consequence: /missed|slow|manual|follow/i.test(signal)
        ? 'lost leads, slower cash collection, and retention risk'
        : 'operator time loss and delayed conversion',
    })),
    experiments: [
      {
        name: '48-hour paid diagnostic pre-sale',
        success_metric: '3 paid checkouts or 5 booked calls',
        channel: input.launch_channel,
      },
      {
        name: 'Lead magnet opt-in test',
        success_metric: '20 percent visitor-to-lead conversion',
        channel: 'landing_page',
      },
    ],
    blockers,
  };
}

function buildOffer(input, idea, validation) {
  const pricing = priceFromScore(validation.demand_score, input.build_profile);
  return {
    promise: `Recover measurable revenue leakage for ${input.target_customer} in ${input.max_days_to_revenue} days.`,
    lead_magnet: {
      title: `${titleCase(input.market)} Revenue Leak Scorecard`,
      format: 'interactive diagnostic',
      conversion_trigger:
        'shows the dollar value of delayed response, missed follow-up, and weak onboarding',
    },
    tripwire: {
      name: `${titleCase(input.market)} Fix-It Kit`,
      price_usd: pricing.tripwire,
      deliverables: ['scorecard report', 'email/SMS scripts', 'implementation checklist'],
    },
    core_offer: {
      name: idea.name,
      price_usd: pricing.setup,
      billing_model:
        input.monetization_goal === 'subscription_first' ? 'subscription' : 'one_time_setup',
      deliverables: ['generated SaaS app', 'funnel', 'CRM pipeline', 'automation pack'],
    },
    recurring_offer: {
      name: `${titleCase(input.market)} Managed Revenue Ops`,
      monthly_usd: pricing.monthly,
      enforcement: 'Stripe entitlement plus tenant module capability gates',
    },
    guarantee: 'If the diagnostic finds no measurable revenue leak, refund the tripwire purchase.',
    do_not_sell_if: validation.blockers,
  };
}

function buildApplication(input, idea, offer) {
  const slug = idea.slug;
  const packageName = slugify(slug);
  return {
    app_type: input.build_profile,
    architecture:
      'Vercel serverless app with tenant-aware modules, Stripe entitlement gates, event logging, and workflow webhooks.',
    modules: [
      'lead_capture',
      'diagnostic_scorecard',
      'offer_checkout',
      'customer_onboarding',
      'automation_workflows',
      'operator_dashboard',
      'affiliate_tracking',
    ],
    routes: [
      '/',
      '/scorecard',
      '/checkout',
      '/dashboard',
      '/onboarding',
      '/api/leads',
      '/api/scorecard',
      '/api/billing/webhook',
      '/api/automations/webhook',
    ],
    data_model: {
      leads: ['id', 'email', 'company', 'source', 'score', 'created_at'],
      customers: ['id', 'stripe_customer_id', 'plan', 'status', 'created_at'],
      factory_runs: ['id', 'idea_slug', 'status', 'manifest_json', 'created_at'],
      affiliate_clicks: ['id', 'partner_id', 'lead_id', 'payout_status', 'created_at'],
    },
    generated_files: {
      'package.json': JSON.stringify(
        {
          name: packageName,
          private: true,
          type: 'module',
          scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
          dependencies: {
            next: '^15.0.0',
            react: '^19.0.0',
            'react-dom': '^19.0.0',
            stripe: '^17.0.0',
          },
        },
        null,
        2,
      ),
      'app/page.tsx': `export default function Page() { return <main><h1>${offer.core_offer.name}</h1><p>${offer.promise}</p></main>; }`,
      'app/api/leads/route.ts':
        'export async function POST(req: Request) { const body = await req.json(); return Response.json({ ok: true, lead: body }); }',
      '.env.example': [
        'STRIPE_SECRET_KEY=',
        'STRIPE_WEBHOOK_SECRET=',
        'DATABASE_URL=',
        'NEXT_PUBLIC_APP_URL=',
      ].join('\n'),
      'vercel.json': JSON.stringify({ framework: 'nextjs' }, null, 2),
    },
  };
}

function buildFunnel(input, offer) {
  return {
    landing_page: {
      headline: offer.core_offer.name,
      subheadline: offer.promise,
      sections: [
        'pain-cost calculator',
        'proof and urgency',
        'lead magnet opt-in',
        'tripwire checkout',
        'managed ops upsell',
      ],
      lead_capture_fields: ['email', 'business_name', 'monthly_leads', 'biggest_leak'],
    },
    content_engine: {
      seo_cluster: [
        `${input.market} lead response time`,
        `${input.market} missed call automation`,
        `${input.market} customer onboarding checklist`,
      ],
      blog_posts: [
        `What slow response really costs a ${input.market} operator`,
        `The ${input.market} follow-up system that protects booked revenue`,
        `How to turn ${input.market} reviews into repeat revenue`,
      ],
      ad_angles: ['lost revenue calculator', 'missed-call recovery', 'follow-up automation'],
    },
    email_sequence: [
      { day: 0, subject: 'Your revenue leak score is ready', goal: 'deliver scorecard' },
      { day: 1, subject: 'The fastest fix is usually not a rebuild', goal: 'sell tripwire' },
      { day: 3, subject: 'Where the money is leaking next', goal: 'book diagnostic' },
      { day: 5, subject: 'Your operating system can run this weekly', goal: 'sell recurring plan' },
    ],
  };
}

function buildRevenue(input, idea, offer) {
  return {
    stripe_catalog: [
      {
        lookup_key: `${idea.slug}_tripwire`,
        name: offer.tripwire.name,
        amount_usd: offer.tripwire.price_usd,
        mode: 'payment',
      },
      {
        lookup_key: `${idea.slug}_core`,
        name: offer.core_offer.name,
        amount_usd: offer.core_offer.price_usd,
        mode: offer.core_offer.billing_model === 'subscription' ? 'subscription' : 'payment',
      },
      {
        lookup_key: `${idea.slug}_managed_ops`,
        name: offer.recurring_offer.name,
        amount_usd: offer.recurring_offer.monthly_usd,
        mode: 'subscription',
        interval: 'month',
      },
    ],
    entitlement_rules: [
      'lead_magnet: email opt-in',
      'tripwire: scorecard and templates',
      'core: app generation and deployment',
      'managed_ops: monitoring, optimization, and workflow repair',
    ],
    affiliate_system: {
      attribution_window_days: 60,
      default_commission_percent: input.launch_channel === 'affiliate' ? 30 : 20,
      partner_mapping: [
        'agencies',
        'newsletter operators',
        'vertical consultants',
        'AppSumo deal traffic',
      ],
    },
    invoicing: {
      provider: 'Stripe',
      contract_trigger: 'core checkout or proposal accepted',
      dunning: 'failed-payment workflow via billing webhook',
    },
  };
}

function buildAutomations() {
  return {
    engine: 'n8n-compatible workflow manifest plus Vercel webhook fallback',
    workflows: [
      {
        code: 'lead_capture_to_crm',
        trigger: 'landing_page_form_submitted',
        actions: ['validate lead', 'score pain', 'create CRM record', 'send scorecard email'],
        recovery: 'retry 3 times with dead-letter event',
      },
      {
        code: 'checkout_to_onboarding',
        trigger: 'stripe_checkout_completed',
        actions: ['grant entitlement', 'create tenant', 'send onboarding link'],
        recovery: 'idempotent by Stripe session id',
      },
      {
        code: 'partner_affiliate_payout',
        trigger: 'paid_conversion_with_partner_id',
        actions: ['record commission', 'queue payout review', 'notify partner'],
        recovery: 'duplicate-safe commission ledger',
      },
      {
        code: 'weekly_optimization_loop',
        trigger: 'schedule.weekly',
        actions: ['read metrics', 'identify funnel bottleneck', 'create agent task'],
        recovery: 'control dashboard alert',
      },
    ],
    integrations: {
      crm: ['SuiteDash-compatible contact and pipeline adapter'],
      no_code: ['n8n', 'Activepieces', 'Zapier webhook bridge'],
      appsumo: ['deal attribution', 'license redemption', 'partner reporting'],
      website_builders: [
        'WordPress export',
        'GroovePages copy blocks',
        'static landing page bundle',
      ],
    },
  };
}

function buildDeployment(input, idea, envValidation) {
  const deploymentBlocked = input.mode === 'launch' && !envValidation.can_launch;
  return {
    target: 'Vercel',
    repository: idea.repo_name,
    environments: ['development', 'preview', 'production'],
    required_env: FACTORY_ENV.launch,
    operational_env: FACTORY_ENV.operate,
    ci_cd: {
      checks: [
        'npm test',
        'env validation',
        'generated app build',
        'smoke checkout',
        'webhook verification',
      ],
      rollback: 'promote previous Vercel deployment and disable new feature flag',
    },
    domain_management: {
      strategy: 'attach configured production domain after deployment health passes',
      dns_requirements: ['A/CNAME target', 'SPF/DKIM/DMARC for email deliverability'],
    },
    status: deploymentBlocked ? 'blocked_missing_env' : 'deployment_plan_ready',
  };
}

function buildAgents(input) {
  const autonomy = input.agent_autonomy;
  return {
    autonomy,
    callable_interfaces: [
      '/api/business-factory',
      '/api/provision',
      '/api/events/ingest-event',
      '/api/automations/webhook',
    ],
    roles: [
      { role: 'market_scout', owns: 'pain signal collection and demand scoring' },
      { role: 'offer_architect', owns: 'offer, pricing, lead magnet, and guarantee' },
      { role: 'app_builder', owns: 'template selection and generated app manifest' },
      { role: 'revenue_operator', owns: 'Stripe catalog, entitlements, dunning, affiliate ledger' },
      { role: 'deployment_operator', owns: 'repo, Vercel, env validation, rollback' },
      { role: 'growth_optimizer', owns: 'weekly metrics loop and experiment queue' },
    ],
    feedback_loops: [
      'lead score -> offer copy revision',
      'checkout conversion -> price test',
      'activation event -> onboarding repair',
      'failed workflow -> retry and dead-letter event',
    ],
    guardrails: {
      supervised: autonomy === 'supervised',
      external_execution_requires_flag: true,
      no_silent_failures: true,
    },
  };
}

function buildControl(input, validation) {
  return {
    dashboard_metrics: [
      'factory_runs_created',
      'lead_capture_rate',
      'tripwire_conversion_rate',
      'core_checkout_rate',
      'mrr',
      'workflow_failure_rate',
      'deployment_success_rate',
    ],
    feature_flags: [
      { key: 'factory.external_execution', enabled: input.execute_external },
      { key: 'factory.money_first_launch', enabled: true },
      { key: 'factory.autonomous_weekly_optimization', enabled: input.agent_autonomy === 'full' },
    ],
    monitoring: {
      event_namespace: 'business_factory',
      alert_thresholds: {
        workflow_failure_rate: 0.05,
        checkout_error_rate: 0.02,
        lead_capture_rate_floor: 0.12,
      },
    },
    recovery: validation.blockers.length
      ? 'route to validation queue before app build'
      : 'continue to launch queue with rollback plan',
  };
}

function buildManifest(input, parts) {
  return {
    created_at: new Date().toISOString(),
    operator_id: input.operator_id,
    external_execution_requested: input.execute_external,
    runbook_order: [
      'validate demand',
      'publish lead magnet',
      'sync Stripe catalog',
      'deploy generated app',
      'enable automations',
      'start weekly optimization loop',
    ],
    money_first_assets: {
      lead_magnet: parts.offer.lead_magnet,
      tripwire: parts.offer.tripwire,
      affiliate: parts.revenue.affiliate_system,
    },
    generated_app_files: Object.keys(parts.application.generated_files),
    automation_workflows: parts.automations.workflows.map((workflow) => workflow.code),
    agent_tasks: parts.agents.roles.map((role) => ({
      assignee: role.role,
      task: role.owns,
      status: 'queued',
    })),
  };
}

export function runBusinessFactory(rawInput, env = process.env) {
  const input = BusinessFactoryInput.parse(rawInput);
  const runIdSource = JSON.stringify({
    operator_id: input.operator_id,
    market: input.market,
    signals: input.pain_signals,
    profile: input.build_profile,
    at: Date.now(),
  });
  const runId = `bf_${crypto.createHash('sha256').update(runIdSource).digest('hex').slice(0, 16)}`;
  const envValidation = validateEnvironment(env, input.mode);
  const painScore = scorePain(input.pain_signals);
  const intentScore = scoreIntent(input.pain_signals, input.monetization_goal);
  const idea = buildIdea(input, painScore, intentScore);
  const validation = buildValidation(input, painScore, intentScore);
  const offer = buildOffer(input, idea, validation);
  const application = buildApplication(input, idea, offer);
  const funnel = buildFunnel(input, offer);
  const revenue = buildRevenue(input, idea, offer);
  const automations = buildAutomations();
  const deployment = buildDeployment(input, idea, envValidation);
  const agents = buildAgents(input);
  const control = buildControl(input, validation);
  const launchManifest = buildManifest(input, {
    offer,
    application,
    revenue,
    automations,
    agents,
  });
  const blockers = [
    ...validation.blockers,
    ...envValidation.missing_required.map((key) => `missing_env:${key}`),
    ...envValidation.missing_operational.map((key) => `missing_operational_env:${key}`),
  ];
  const status =
    input.mode === 'plan' ? 'planned' : blockers.length > 0 ? 'blocked' : 'ready_for_launch';

  const output = {
    ok: true,
    factory_version: 'v1.0',
    run_id: runId,
    status,
    env_validation: envValidation,
    idea,
    validation,
    offer,
    application,
    funnel,
    revenue,
    automations,
    deployment,
    agents,
    control,
    launch_manifest: launchManifest,
    blockers,
  };

  return BusinessFactoryOutput.parse(output);
}

export function requiredFactoryEnv() {
  return FACTORY_ENV;
}
