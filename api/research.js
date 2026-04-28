// ── Your Deputy — Pre-Build Research Engine ─────────────────────────────
// Pulls REAL market data before framework analysis runs.
// Sources: Firecrawl (deep page content), Exa.ai (semantic competitors/market),
//          NeuronWriter (SEO), Outscraper (local)
import net from 'node:net';

import {
  aiCorsHeaders,
  authorizeAiRequest,
  validateAiTextLimit,
  writeAiAuthError,
} from './_ai_security.mjs';

export const maxDuration = 60;

const MAX_RESEARCH_QUERY_CHARS = 500;
const MAX_RESEARCH_NICHE_CHARS = 300;
const MAX_RESEARCH_LOCATION_CHARS = 180;
const MAX_RESEARCH_URL_CHARS = 2048;
const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.test'];

function researchActionCost(action) {
  switch (String(action || '').trim()) {
    case 'full_research':
      return 10;
    case 'firecrawl_search':
      return 5;
    case 'scrape_url':
      return 4;
    case 'competitors':
      return 3;
    case 'seo':
      return 2;
    default:
      return 1;
  }
}

function sendLimitError(res, check) {
  return res.status(check.status || 413).json({
    ok: false,
    error: check.error,
    length: check.length,
    max_chars: check.max_chars,
  });
}

function validateResearchText(res, name, value, maxChars) {
  const check = validateAiTextLimit(name, value, maxChars);
  if (!check.ok) return { ok: false, response: sendLimitError(res, check) };
  return { ok: true, text: check.text.trim() };
}

function isBlockedIpv4(host) {
  const parts = host.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isBlockedIpv6(host) {
  const h = host.toLowerCase();
  return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:');
}

function validatePublicResearchUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: false, error: 'https url required' };
  if (raw.length > MAX_RESEARCH_URL_CHARS) return { ok: false, error: 'url_too_large' };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'https url required' };
  if (parsed.username || parsed.password) return { ok: false, error: 'url_credentials_not_allowed' };
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, error: 'public_url_required' };
  }
  const ipVersion = net.isIP(host);
  if ((ipVersion === 4 && isBlockedIpv4(host)) || (ipVersion === 6 && isBlockedIpv6(host))) {
    return { ok: false, error: 'public_url_required' };
  }
  return { ok: true, url: parsed.toString() };
}

// ── Firecrawl: deep page content + search-and-scrape in one call ─────────────
// Used for TAM/SAM/SOM + competitive-matrix frameworks where snippets aren't
// enough — we need actual page contents (pricing tables, feature matrices,
// etc.). Falls back gracefully if FIRECRAWL_API_KEY is absent.
async function firecrawlSearch(query, { limit = 5, scrape = true } = {}) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const body = { query, limit };
    if (scrape) body.scrapeOptions = { formats: ['markdown'], onlyMainContent: true };
    const r = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const data = d.data || d.results || [];
    return data.map((item) => ({
      title: item.title || item.metadata?.title || '',
      url: item.url || item.metadata?.url || '',
      snippet: (item.description || item.metadata?.description || '').slice(0, 300),
      markdown: (item.markdown || '').slice(0, 4000),
    }));
  } catch {
    return null;
  }
}

async function firecrawlScrape(url) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || !url) return null;
  try {
    const r = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const md = d?.data?.markdown || d?.markdown || '';
    if (!md) return null;
    return { url, markdown: md.slice(0, 4000), title: d?.data?.metadata?.title || d?.metadata?.title || '' };
  } catch {
    return null;
  }
}

// ── Exa.ai: Semantic search for competitors, pricing, market data ────────────
async function searchExa(query, numResults = 5) {
  const key = process.env.EXA_AI_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        num_results: numResults,
        use_autoprompt: true,
        type: 'auto',
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.text?.slice(0, 300) || '',
      score: r.score,
    }));
  } catch { return null; }
}

async function getExaContents(urls) {
  const key = process.env.EXA_AI_API_KEY;
  if (!key || !urls?.length) return null;
  try {
    const r = await fetch('https://api.exa.ai/contents', {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: urls.slice(0, 3), text: { max_characters: 1000 } }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.results || []).map(r => ({
      title: r.title,
      url: r.url,
      text: r.text?.slice(0, 800) || '',
    }));
  } catch { return null; }
}

// ── NeuronWriter: SEO keyword data ───────────────────────────────────────────
async function getNeuronWriterData(keyword) {
  const key = process.env.NEURONWRITER_API_KEY;
  if (!key) return null;
  try {
    // NeuronWriter API — get keyword suggestions and difficulty
    const r = await fetch('https://app.neuronwriter.com/api/v1/keywords/suggestions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, language: 'en', country: 'us' }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── Outscraper: Count local businesses in a niche ────────────────────────────
async function countLocalBusinesses(niche, location) {
  const keys = [process.env.OUTSCRAPER_API_KEY, process.env.OUTSCRAPER_API_KEY_2].filter(Boolean);
  if (!keys.length) return null;
  try {
    const query = encodeURIComponent(`${niche} in ${location}`);
    let resp;
    for (const key of keys) {
      try {
        resp = await fetch(`https://api.app.outscraper.com/google-maps-search?query=${query}&limit=1&language=en`, {
          headers: { 'X-API-KEY': key },
        });
        if (resp.ok) break;
      } catch { continue; }
    }
    if (!resp?.ok) return null;
    const d = await resp.json();
    const results = Array.isArray(d) ? d.flat() : (d.data || d.results || []);
    return {
      count: results.length,
      sample: results.slice(0, 3).map(r => ({
        name: r.name,
        rating: r.rating,
        reviews: r.reviews || r.reviews_count,
        type: r.type,
      })),
    };
  } catch { return null; }
}

// ── Hexomatic: Scrape competitor features/pricing ────────────────────────────
async function scrapeCompetitor(url) {
  const key = process.env.HEXOMATIC_API_KEY;
  if (!key || !url) return null;
  // Hexomatic requires workflow creation — too complex for real-time
  // Return null, use Exa.ai content extraction instead
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://yourdeputy.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', aiCorsHeaders());
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Security: require paid/admin/gateway auth and share AI spend budget.
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = req.body || {};
  const action = String(body.action || '').trim();

  const auth = await authorizeAiRequest(req, body, { cost: researchActionCost(action) });
  if (!auth.ok) return writeAiAuthError(res, auth);

  const { niche, description, location, keywords } = body;
  const nicheText = validateResearchText(res, 'niche', niche, MAX_RESEARCH_NICHE_CHARS);
  const locationText = validateResearchText(res, 'location', location, MAX_RESEARCH_LOCATION_CHARS);
  const descriptionText = validateResearchText(res, 'description', description, MAX_RESEARCH_QUERY_CHARS);
  if (!nicheText.ok) return nicheText.response;
  if (!locationText.ok) return locationText.response;
  if (!descriptionText.ok) return descriptionText.response;

  // ── FULL RESEARCH PACKAGE ──────────────────────────────────────────────
  // Run all research in parallel, return combined results
  if (action === 'full_research') {
    if (!nicheText.text) return res.status(400).json({ error: 'niche required' });

    const results = { sources: [], timestamp: new Date().toISOString() };

    // Run all research calls in parallel. Firecrawl runs alongside Exa — it
    // returns full-page markdown (pricing tables, feature matrices) that
    // semantic snippets alone can't provide for TAM/SAM/SOM + competitive-
    // matrix grounding. If the Firecrawl key is absent, the call returns null
    // and the pipeline falls back to Exa snippets only.
    const [competitors, marketData, pricingData, seoData, localData, firecrawlDeep] = await Promise.allSettled([
      // 1. Find competitors
      searchExa(`${nicheText.text} competitors companies startups`, 5),
      // 2. Market size / reports
      searchExa(`${nicheText.text} market size TAM revenue 2025 2026`, 3),
      // 3. Pricing intelligence
      searchExa(`${nicheText.text} software pricing plans monthly annual`, 3),
      // 4. SEO keyword data
      getNeuronWriterData(nicheText.text),
      // 5. Local business count (if applicable)
      locationText.text ? countLocalBusinesses(nicheText.text, locationText.text) : Promise.resolve(null),
      // 6. Firecrawl deep content (page markdown for real pricing/competitor data)
      firecrawlSearch(`${nicheText.text} pricing competitor comparison`, { limit: 4, scrape: true }),
    ]);

    // Compile competitors
    if (competitors.status === 'fulfilled' && competitors.value) {
      results.competitors = competitors.value;
      results.sources.push('exa.ai');

      // Get detailed content from top 2 competitor pages
      const topUrls = competitors.value.slice(0, 2).map(c => c.url);
      const contents = await getExaContents(topUrls);
      if (contents) results.competitor_details = contents;
    }

    // Compile market data
    if (marketData.status === 'fulfilled' && marketData.value) {
      results.market_data = marketData.value;
      if (!results.sources.includes('exa.ai')) results.sources.push('exa.ai');
    }

    // Compile pricing
    if (pricingData.status === 'fulfilled' && pricingData.value) {
      results.pricing_data = pricingData.value;
    }

    // Compile SEO data
    if (seoData.status === 'fulfilled' && seoData.value) {
      results.seo_data = seoData.value;
      results.sources.push('neuronwriter');
    }

    // Compile local data
    if (localData.status === 'fulfilled' && localData.value) {
      results.local_market = localData.value;
      results.sources.push('outscraper');
    }

    // Compile Firecrawl deep content — attach full-page markdown to whichever
    // bucket is most useful (competitor_details if we have matching URLs,
    // else as its own deep_content array).
    if (firecrawlDeep.status === 'fulfilled' && Array.isArray(firecrawlDeep.value) && firecrawlDeep.value.length) {
      results.deep_content = firecrawlDeep.value;
      results.sources.push('firecrawl');
    }

    // Build a compressed research summary for injection into AI prompts
    let summary = `## Market Research Data (real sources: ${results.sources.join(', ')})\n\n`;

    if (results.competitors?.length) {
      summary += `### Competitors Found\n`;
      results.competitors.forEach(c => {
        summary += `- ${c.title}: ${c.snippet.slice(0, 150)}\n`;
      });
      summary += '\n';
    }

    if (results.market_data?.length) {
      summary += `### Market Intelligence\n`;
      results.market_data.forEach(m => {
        summary += `- ${m.title}: ${m.snippet.slice(0, 150)}\n`;
      });
      summary += '\n';
    }

    if (results.pricing_data?.length) {
      summary += `### Pricing Intelligence\n`;
      results.pricing_data.forEach(p => {
        summary += `- ${p.title}: ${p.snippet.slice(0, 150)}\n`;
      });
      summary += '\n';
    }

    if (results.local_market) {
      summary += `### Local Market: ${results.local_market.count} businesses found\n`;
      results.local_market.sample?.forEach(b => {
        summary += `- ${b.name} (${b.rating}★, ${b.reviews} reviews)\n`;
      });
      summary += '\n';
    }

    if (results.seo_data) {
      summary += `### SEO Data\n${JSON.stringify(results.seo_data).slice(0, 500)}\n\n`;
    }

    results.summary = summary;
    results.summary_tokens = Math.ceil(summary.length / 4);

    return res.json(results);
  }

  // ── COMPETITOR SEARCH ONLY ─────────────────────────────────────────────
  if (action === 'competitors') {
    if (!nicheText.text) return res.status(400).json({ error: 'niche required' });
    const results = await searchExa(`${nicheText.text} competitors companies`, 8);
    return res.json({ competitors: results || [] });
  }

  // ── SEO DATA ONLY ─────────────────────────────────────────────────────
  if (action === 'seo') {
    const keywordValue = Array.isArray(keywords) ? keywords[0] : nicheText.text;
    const keyword = validateResearchText(res, 'keyword', keywordValue, MAX_RESEARCH_QUERY_CHARS);
    if (!keyword.ok) return keyword.response;
    if (!keyword.text) return res.status(400).json({ error: 'keyword or niche required' });
    const results = await getNeuronWriterData(keyword.text);
    return res.json({ seo: results });
  }

  // ── FIRECRAWL: deep page scrape ───────────────────────────────────────
  // Used by framework generators that need full-page content (pricing tables,
  // competitor feature matrices, regulatory docs) instead of semantic snippets.
  if (action === 'scrape_url') {
    const safeUrl = validatePublicResearchUrl(req.body?.url);
    if (!safeUrl.ok) return res.status(400).json({ error: safeUrl.error });
    const out = await firecrawlScrape(safeUrl.url);
    if (!out) return res.json({ ok: false, error: 'firecrawl unavailable or scrape failed' });
    return res.json({ ok: true, ...out });
  }

  if (action === 'firecrawl_search') {
    const query = validateResearchText(res, 'query', req.body?.query || nicheText.text, MAX_RESEARCH_QUERY_CHARS);
    if (!query.ok) return query.response;
    if (!query.text) return res.status(400).json({ error: 'query or niche required' });
    const scrape = req.body?.scrape !== false;
    const parsedLimit = Number.parseInt(req.body?.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 5, 1), 8);
    const out = await firecrawlSearch(query.text, { limit, scrape });
    if (!out) return res.json({ ok: false, error: 'firecrawl unavailable' });
    return res.json({ ok: true, results: out });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
