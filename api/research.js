// ── Your Deputy — Pre-Build Research Engine ─────────────────────────────
// Pulls REAL market data before framework analysis runs.
// Sources: Firecrawl (deep page content), Exa.ai (semantic competitors/market),
//          NeuronWriter (SEO), Outscraper (local)
import { privilegedCorsHeaders, verifyPaidOrAdminCredential } from './tenants/_auth.mjs';

export const maxDuration = 60;

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
  res.setHeader('Access-Control-Allow-Headers', privilegedCorsHeaders());
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Security: require paid session or admin token (HMAC-verified) ──
  const auth = verifyPaidOrAdminCredential(req, req.body || {});
  if (!auth.ok) return res.status(auth.status || 401).json({ ok: false, error: 'Authentication required' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action, niche, description, location, keywords } = req.body || {};

  // ── FULL RESEARCH PACKAGE ──────────────────────────────────────────────
  // Run all research in parallel, return combined results
  if (action === 'full_research') {
    if (!niche) return res.status(400).json({ error: 'niche required' });

    const results = { sources: [], timestamp: new Date().toISOString() };

    // Run all research calls in parallel. Firecrawl runs alongside Exa — it
    // returns full-page markdown (pricing tables, feature matrices) that
    // semantic snippets alone can't provide for TAM/SAM/SOM + competitive-
    // matrix grounding. If the Firecrawl key is absent, the call returns null
    // and the pipeline falls back to Exa snippets only.
    const [competitors, marketData, pricingData, seoData, localData, firecrawlDeep] = await Promise.allSettled([
      // 1. Find competitors
      searchExa(`${niche} competitors companies startups`, 5),
      // 2. Market size / reports
      searchExa(`${niche} market size TAM revenue 2025 2026`, 3),
      // 3. Pricing intelligence
      searchExa(`${niche} software pricing plans monthly annual`, 3),
      // 4. SEO keyword data
      getNeuronWriterData(niche),
      // 5. Local business count (if applicable)
      location ? countLocalBusinesses(niche, location) : Promise.resolve(null),
      // 6. Firecrawl deep content (page markdown for real pricing/competitor data)
      firecrawlSearch(`${niche} pricing competitor comparison`, { limit: 4, scrape: true }),
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
    const results = await searchExa(`${niche} competitors companies`, 8);
    return res.json({ competitors: results || [] });
  }

  // ── SEO DATA ONLY ─────────────────────────────────────────────────────
  if (action === 'seo') {
    const keyword = keywords?.[0] || niche;
    const results = await getNeuronWriterData(keyword);
    return res.json({ seo: results });
  }

  // ── FIRECRAWL: deep page scrape ───────────────────────────────────────
  // Used by framework generators that need full-page content (pricing tables,
  // competitor feature matrices, regulatory docs) instead of semantic snippets.
  if (action === 'scrape_url') {
    const url = (req.body?.url || '').toString();
    if (!url || !/^https:\/\//.test(url)) return res.status(400).json({ error: 'https url required' });
    const out = await firecrawlScrape(url);
    if (!out) return res.json({ ok: false, error: 'firecrawl unavailable or scrape failed' });
    return res.json({ ok: true, ...out });
  }

  if (action === 'firecrawl_search') {
    const query = (req.body?.query || niche || '').toString();
    if (!query) return res.status(400).json({ error: 'query or niche required' });
    const scrape = req.body?.scrape !== false;
    const limit = Math.min(parseInt(req.body?.limit, 10) || 5, 10);
    const out = await firecrawlSearch(query, { limit, scrape });
    if (!out) return res.json({ ok: false, error: 'firecrawl unavailable' });
    return res.json({ ok: true, results: out });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
