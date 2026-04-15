#!/usr/bin/env node
/**
 * Parse docs-source/SERVICE_BUSINESS_AUTOMATION_CATALOG.md
 * into registry/automations.json.
 *
 * This is the single source-of-truth pipeline:
 *   docs-source MD  →  scripts/parse-catalog.mjs  →  registry/automations.json
 *
 * The generated file is committed so the CLI can ship without requiring the
 * MD parse at runtime. Re-run this script whenever the catalog changes.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'docs-source', 'SERVICE_BUSINESS_AUTOMATION_CATALOG.md');
const OUT_AUTOMATIONS = join(ROOT, 'registry', 'automations.json');
const OUT_CATEGORIES = join(ROOT, 'registry', 'categories.json');

// --- Persona -> category mapping, extracted from AUTOMATION_UX_BIBLE_PART1.md
//     "Primary automation categories:" lines for the 10 Group-1 personas.
const PERSONA_CATEGORIES = {
  solo_steve: [1, 2, 3, 4, 5, 8, 9, 12, 13, 14, 15, 21, 35],
  manager_maria: [4, 5, 8, 10, 11, 18, 22, 23, 36, 37],
  owner_omar: [1, 5, 6, 7, 10, 15, 16, 17, 23, 27, 30, 31, 38, 45],
  franchise_fran: [8, 10, 11, 18, 22, 23, 37, 38, 41, 45],
  startup_sam: [1, 2, 3, 8, 12, 13, 14, 24, 25, 26, 27, 28, 39, 42, 45],
  agency_alex: [5, 6, 7, 8, 10, 11, 15, 23, 24, 30, 31, 39],
  field_service_fred: [8, 9, 10, 11, 14, 38],
  bookkeeper_beth: [15, 16, 17, 20, 23, 35],
  marketing_mike: [24, 25, 26, 27, 28, 42],
  compliance_carol: [7, 20, 35, 37, 41, 43, 44],
};

// --- Stack normalization: catalog free-text -> canonical stack IDs.
const STACK_NORMALIZATION = [
  [/\bn8n\b/i, 'n8n'],
  [/\bsuitedash\b/i, 'suitedash'],
  [/\bhubspot\b/i, 'hubspot'],
  [/\bservicetitan\b/i, 'servicetitan'],
  [/\bemailit\b/i, 'emailit'],
  [/\bacumbamail\b/i, 'acumbamail'],
  [/\bsms-?it\b/i, 'smsit'],
  [/\btwilio\b/i, 'twilio'],
  [/\bcallscaler\b/i, 'callscaler'],
  [/\bthoughtly\b/i, 'thoughtly'],
  [/\binsighto\b/i, 'insighto'],
  [/\bchatbase\b/i, 'chatbase'],
  [/\bstripe\b/i, 'stripe'],
  [/\bdocumentero\b/i, 'documentero'],
  [/\bsparkreceipt\b/i, 'sparkreceipt'],
  [/\bwriterzen\b/i, 'writerzen'],
  [/\bneuronwriter\b/i, 'neuronwriter'],
  [/\bvadoo(\s*ai)?\b/i, 'vadoo'],
  [/\bfliki\b/i, 'fliki'],
  [/\bvista\s*social\b/i, 'vista_social'],
  [/\bplerdy\b/i, 'plerdy'],
  [/\bposthog\b/i, 'posthog'],
  [/\bhappierleads\b/i, 'happierleads'],
  [/\bsalespanel\b/i, 'salespanel'],
  [/\bneon\b/i, 'neon'],
  [/\btrafft\b/i, 'trafft'],
  [/\bbrilliant\s*directories\b/i, 'brilliant_directories'],
  [/\blob\b/i, 'lob'],
  [/\bgoogle\s*(sheets?|business|calendar|maps?)\b/i, 'google_api'],
  [/\bquickbooks|qbo\b/i, 'quickbooks'],
  [/\bxero\b/i, 'xero'],
  [/\bopenai\b/i, 'openai'],
  [/\bgroq\b/i, 'groq'],
  [/\banthropic|claude\b/i, 'anthropic'],
  [/\bgemini|gemma\b/i, 'google_ai'],
  [/\bhunter\.?io\b/i, 'hunter'],
  [/\bsnov\.?io\b/i, 'snov'],
  [/\bapollo\b/i, 'apollo'],
  [/\bbuiltwith\b/i, 'builtwith'],
  [/\boutscraper\b/i, 'outscraper'],
  [/\bserpapi\b/i, 'serpapi'],
  [/\bslack\b/i, 'slack'],
  [/\btelegram\b/i, 'telegram'],
  [/\bpacer\b/i, 'pacer'],
  [/\bpa\s*dos\b/i, 'pa_dos'],
  [/\bscraper|web[-_ ]scraper\b/i, 'scraper'],
  [/\bpostcardmania\b/i, 'postcardmania'],
  [/\bvercel\b/i, 'vercel'],
  [/\bgithub\b/i, 'github'],
];

const PUBLIC_SOURCE_STACKS = new Set(['scraper', 'pacer', 'pa_dos', 'outscraper', 'serpapi', 'builtwith']);
const VENDOR_CONFIGURABLE = new Set(['suitedash', 'stripe', 'acumbamail', 'vista_social', 'trafft']);

function normalizeStack(rawStack) {
  const found = new Set();
  for (const [rx, id] of STACK_NORMALIZATION) {
    if (rx.test(rawStack)) found.add(id);
  }
  // Default to n8n if the entry mentions a cron and we found nothing.
  if (found.size === 0) found.add('n8n');
  return Array.from(found);
}

function inferTriggerType(triggerRaw) {
  const t = triggerRaw.toLowerCase();
  if (/cron|daily|weekly|hourly|monthly|every\s+\d/i.test(t)) return 'cron';
  if (/webhook/.test(t)) return 'webhook';
  if (/on[- ]?demand|api\s*call/.test(t)) return 'api';
  if (/form\s*submit/.test(t)) return 'form_submit';
  if (/crm\s*(tag|stage|event|field)/.test(t)) return 'crm_event';
  if (/email\s*received/.test(t)) return 'email_received';
  if (/manual/.test(t)) return 'manual';
  if (/real[- ]?time|keyword\s*match/.test(t)) return 'webhook';
  return 'manual';
}

function inferOutputTypes(outputRaw) {
  const o = outputRaw.toLowerCase();
  const types = new Set();
  if (/alert|notification|slack|email.*alert/.test(o)) types.add('alert');
  if (/pdf|image|video|audio|file|zip/.test(o)) types.add('artifact');
  if (/post|article|email|newsletter|blog/.test(o)) types.add('content');
  if (/score|rank|class|route|flag/.test(o)) types.add('decision');
  if (/invoice|subscription|payment|appointment|booking|event/.test(o)) types.add('action');
  if (/digest|report|dashboard|weekly|monthly/.test(o)) types.add('digest');
  if (/record|contact|lead|crm\s*entry|row/.test(o)) types.add('record');
  if (types.size === 0) types.add('record');
  return Array.from(types);
}

function inferTopology({ trigger, stack }) {
  const hasScraper = stack.some((s) => PUBLIC_SOURCE_STACKS.has(s));
  if (trigger === 'cron') {
    return hasScraper ? 'T5' : 'T1';
  }
  if (trigger === 'webhook' || trigger === 'crm_event') {
    return stack.length > 3 ? 'T3' : 'T1';
  }
  if (trigger === 'api' || trigger === 'form_submit') return 'T2';
  if (stack.length === 1 && VENDOR_CONFIGURABLE.has(stack[0])) return 'T4';
  return 'T3';
}

function inferDataSensitivity({ category_id, stack, task, output }) {
  const blob = `${task} ${output}`.toLowerCase();
  if ([15, 16, 17, 18].includes(category_id) || /payment|invoice|refund|stripe/.test(blob)) return 'financial';
  if ([20, 43, 44].includes(category_id)) return 'regulated';
  if (/pii|ssn|dob|address|personal/.test(blob)) return 'customer_pii';
  if (/public|state|county|sos|court|whois|yelp|google maps/.test(blob)) return 'public';
  return 'internal';
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function estimateTokens({ stack, category_id }) {
  const llmProviders = new Set(['openai', 'anthropic', 'groq', 'google_ai']);
  if (!stack.some((s) => llmProviders.has(s))) return 0;
  // Heuristic: category-driven.
  if ([22, 24, 45].includes(category_id)) return 150_000;
  if ([3, 19, 30, 40].includes(category_id)) return 40_000;
  return 20_000;
}

function personaFit(category_id) {
  const fit = {};
  for (const [persona, cats] of Object.entries(PERSONA_CATEGORIES)) {
    if (cats.includes(category_id)) fit[persona] = 0.8;
  }
  return fit;
}

function parseCatalog(md) {
  const lines = md.split('\n');
  const automations = [];
  const categories = [];
  let currentCategory = null;
  let currentEntry = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const catMatch = line.match(/^##\s+(\d{1,2})\.\s+(.+?)\s*$/);
    if (catMatch) {
      if (currentEntry) finalize(currentEntry);
      currentCategory = { id: Number(catMatch[1]), name: catMatch[2].trim(), automations: [] };
      categories.push(currentCategory);
      currentEntry = null;
      continue;
    }
    if (!currentCategory) continue;
    const entryMatch = line.match(/^###\s+(\d{1,2})\.(\d{2})\s*—\s*(.+?)\s*$/);
    if (entryMatch) {
      if (currentEntry) finalize(currentEntry);
      currentEntry = {
        id: `${entryMatch[1]}.${entryMatch[2]}`,
        category_id: Number(entryMatch[1]),
        title: entryMatch[3].trim(),
        task: '',
        trigger_raw: '',
        output_raw: '',
        stack_raw: '',
      };
      continue;
    }
    if (!currentEntry) continue;
    const fieldMatch = line.match(/^\*\*(Task|Trigger|Output|Stack):\*\*\s*(.+)$/);
    if (fieldMatch) {
      const k = fieldMatch[1].toLowerCase();
      const v = fieldMatch[2].trim();
      if (k === 'task') currentEntry.task = v;
      if (k === 'trigger') currentEntry.trigger_raw = v;
      if (k === 'output') currentEntry.output_raw = v;
      if (k === 'stack') currentEntry.stack_raw = v;
    }
  }
  if (currentEntry) finalize(currentEntry);

  function finalize(entry) {
    const trigger_type = inferTriggerType(entry.trigger_raw);
    const output_types = inferOutputTypes(entry.output_raw);
    const stack = normalizeStack(entry.stack_raw);
    const topology = inferTopology({ trigger: trigger_type, stack });
    const data_sensitivity = inferDataSensitivity({
      category_id: entry.category_id,
      stack,
      task: entry.task,
      output: entry.output_raw,
    });
    const record = {
      id: entry.id,
      slug: slugify(entry.title),
      title: entry.title,
      category_id: entry.category_id,
      category: currentCategory.name,
      task: entry.task,
      trigger_raw: entry.trigger_raw,
      trigger_type,
      output_raw: entry.output_raw,
      output_types,
      stack_raw: entry.stack_raw,
      stack,
      topology,
      data_sensitivity,
      persona_fit: personaFit(entry.category_id),
      estimated_monthly_tokens: estimateTokens({ stack, category_id: entry.category_id }),
      manifest_ref: null,
    };
    automations.push(record);
    currentCategory.automations.push(entry.id);
  }

  return { automations, categories };
}

async function main() {
  const md = await readFile(SOURCE, 'utf8');
  const { automations, categories } = parseCatalog(md);
  await mkdir(dirname(OUT_AUTOMATIONS), { recursive: true });
  await writeFile(OUT_AUTOMATIONS, JSON.stringify(automations, null, 2));
  await writeFile(OUT_CATEGORIES, JSON.stringify(categories, null, 2));
  console.log(`Parsed ${automations.length} automations across ${categories.length} categories.`);
  console.log(`  -> ${OUT_AUTOMATIONS}`);
  console.log(`  -> ${OUT_CATEGORIES}`);

  // Quick sanity summary
  const byTopo = {};
  for (const a of automations) byTopo[a.topology] = (byTopo[a.topology] || 0) + 1;
  console.log('Topology distribution:', byTopo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
