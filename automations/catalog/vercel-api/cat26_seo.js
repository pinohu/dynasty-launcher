import { Pool } from '@neondatabase/serverless';
import { Resend } from 'resend';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const resend = new Resend(process.env.ACUMBAMAIL_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, payload } = req.body;

    switch (action) {
      case 'track_keywords':
        return await trackKeywordRanks(req, res);
      case 'detect_broken_links':
        return await detectBrokenLinks(req, res);
      case 'audit_meta_tags':
        return await auditMetaTags(req, res);
      case 'monitor_backlinks':
        return await monitorBacklinks(req, res);
      case 'analyze_content_gap':
        return await analyzeContentGap(req, res);
      case 'monitor_page_speed':
        return await monitorPageSpeed(req, res);
      case 'validate_technical_seo':
        return await validateTechnicalSEO(req, res);
      case 'check_local_citations':
        return await checkLocalCitations(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function trackKeywordRanks(req, res) {
  const client = await pool.connect();
  try {
    const { keywords = [], domain = process.env.DOMAIN } = req.body;

    if (keywords.length === 0) {
      return res.status(400).json({ error: 'keywords required' });
    }

    // Simulate fetching ranks (in production, integrate with SEO API like SEMrush, Ahrefs)
    const result = await client.query(
      `SELECT keyword, rank_position, search_volume, cpc, intent, tracked_date
       FROM keyword_rankings
       WHERE tracked_date >= NOW() - interval '30 days'
       ORDER BY tracked_date DESC, rank_position ASC`
    );

    const rankings = result.rows.map(row => ({
      keyword: row.keyword,
      rank: parseInt(row.rank_position),
      searchVolume: parseInt(row.search_volume),
      cpc: parseFloat(row.cpc),
      intent: row.intent,
      date: row.tracked_date
    }));

    // Identify dropped rankings (rank > 10)
    const dropped = rankings.filter(r => r.rank > 10);
    const improved = rankings.filter(r => r.rank <= 5);

    if (dropped.length > 0) {
      try {
        await resend.emails.send({
          from: 'seo@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `SEO Alert: ${dropped.length} Keywords Dropped in Rankings`,
          html: `
            <h2>Keyword Ranking Alert</h2>
            <p>${dropped.length} keywords have dropped out of top 10.</p>
            <ul>
              ${dropped.slice(0, 5).map(k => 
                `<li><strong>${k.keyword}</strong> - Now ranked #${k.rank}</li>`
              ).join('')}
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    await client.query(
      `INSERT INTO seo_reports (metric, data, created_at) 
       VALUES ('keyword_rankings', $1, NOW())`,
      [JSON.stringify(rankings)]
    );

    res.status(200).json({
      success: true,
      totalKeywords: rankings.length,
      topRanked: rankings.filter(r => r.rank <= 5),
      dropped,
      improved,
      allRankings: rankings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function detectBrokenLinks(req, res) {
  const client = await pool.connect();
  try {
    const { domain = process.env.DOMAIN } = req.body;

    // In production, crawl website and check for broken links
    const result = await client.query(
      `SELECT url, referring_page, http_status, error_type, detected_at
       FROM broken_links
       WHERE domain = $1 AND detected_at > NOW() - interval '7 days'
       ORDER BY detected_at DESC`,
      [domain]
    );

    const brokenLinks = result.rows.map(row => ({
      url: row.url,
      referringPage: row.referring_page,
      status: parseInt(row.http_status),
      error: row.error_type,
      detectedAt: row.detected_at
    }));

    const critical = brokenLinks.filter(l => l.status >= 500);
    const notFound = brokenLinks.filter(l => l.status === 404);

    if (brokenLinks.length > 0) {
      try {
        await resend.emails.send({
          from: 'seo@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Broken Links Alert: ${brokenLinks.length} Issues Found`,
          html: `
            <h2>Broken Links Report</h2>
            <p>Found ${brokenLinks.length} broken links on your site.</p>
            <ul>
              ${brokenLinks.slice(0, 10).map(l => 
                `<li>${l.url} (${l.status}) - from ${l.referringPage}</li>`
              ).join('')}
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    await client.query(
      `INSERT INTO seo_reports (metric, data, created_at) 
       VALUES ('broken_links', $1, NOW())`,
      [JSON.stringify(brokenLinks)]
    );

    res.status(200).json({
      success: true,
      totalBrokenLinks: brokenLinks.length,
      critical: critical.length,
      notFound: notFound.length,
      links: brokenLinks.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function auditMetaTags(req, res) {
  const client = await pool.connect();
  try {
    const { domain = process.env.DOMAIN } = req.body;

    const result = await client.query(
      `SELECT page_url, title_tag, meta_description, heading_h1, 
       title_length, description_length, audit_status, issues
       FROM meta_audit
       WHERE domain = $1 AND audited_at > NOW() - interval '7 days'`,
      [domain]
    );

    const pages = result.rows.map(row => {
      const issues = [];
      
      if (!row.title_tag) issues.push('Missing title tag');
      if (row.title_length < 30 || row.title_length > 60) issues.push('Title length not optimal');
      if (!row.meta_description) issues.push('Missing meta description');
      if (row.description_length < 120 || row.description_length > 160) issues.push('Description length not optimal');
      if (!row.heading_h1) issues.push('Missing H1 tag');

      return {
        pageUrl: row.page_url,
        titleTag: row.title_tag,
        metaDescription: row.meta_description,
        h1: row.heading_h1,
        issues,
        status: issues.length === 0 ? 'pass' : 'fail'
      };
    });

    const failing = pages.filter(p => p.status === 'fail');

    await client.query(
      `INSERT INTO seo_reports (metric, data, created_at) 
       VALUES ('meta_audit', $1, NOW())`,
      [JSON.stringify(pages)]
    );

    res.status(200).json({
      success: true,
      totalPages: pages.length,
      passingPages: pages.filter(p => p.status === 'pass').length,
      failingPages: failing.length,
      pages: pages.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function monitorBacklinks(req, res) {
  const client = await pool.connect();
  try {
    const { domain = process.env.DOMAIN } = req.body;

    // Fetch from backlink database
    const [newResult, lostResult] = await Promise.all([
      client.query(
        `SELECT referring_domain, referring_page, anchor_text, domain_authority
         FROM backlinks_new
         WHERE target_domain = $1 AND detected_at > NOW() - interval '7 days'
         ORDER BY domain_authority DESC`,
        [domain]
      ),
      client.query(
        `SELECT referring_domain, anchor_text, lost_at
         FROM backlinks_lost
         WHERE target_domain = $1 AND lost_at > NOW() - interval '7 days'`,
        [domain]
      )
    ]);

    const newBacklinks = newResult.rows.map(r => ({
      referringDomain: r.referring_domain,
      anchorText: r.anchor_text,
      da: parseInt(r.domain_authority)
    }));

    const lostBacklinks = lostResult.rows.map(r => ({
      referringDomain: r.referring_domain,
      anchorText: r.anchor_text,
      lostAt: r.lost_at
    }));

    // Alert on lost high-authority backlinks
    const criticalLoss = lostBacklinks.filter(l => l.da >= 50);

    if (criticalLoss.length > 0) {
      try {
        await resend.emails.send({
          from: 'seo@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Backlink Alert: Lost ${criticalLoss.length} High-Authority Links`,
          html: `
            <h2>Critical Backlink Loss</h2>
            <p>Lost ${criticalLoss.length} high-authority backlinks.</p>
            <ul>
              ${criticalLoss.slice(0, 5).map(l => 
                `<li><strong>${l.referringDomain}</strong> (DA: ${l.da})</li>`
              ).join('')}
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      newBacklinks: newBacklinks.length,
      lostBacklinks: lostBacklinks.length,
      criticalLoss: criticalLoss.length,
      topNewBacklinks: newBacklinks.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function analyzeContentGap(req, res) {
  const client = await pool.connect();
  try {
    const { competitors = [], domain = process.env.DOMAIN } = req.body;

    if (competitors.length === 0) {
      return res.status(400).json({ error: 'competitors required' });
    }

    // Simulate competitor content analysis
    const result = await client.query(
      `SELECT topic, keyword_cluster, competitor_coverage, our_coverage, gap_score
       FROM content_gap_analysis
       WHERE domain = $1 AND analyzed_at > NOW() - interval '30 days'
       ORDER BY gap_score DESC`,
      [domain]
    );

    const gaps = result.rows.map(row => ({
      topic: row.topic,
      keywordCluster: row.keyword_cluster,
      competitorCoverage: parseInt(row.competitor_coverage),
      ourCoverage: parseInt(row.our_coverage),
      opportunity: Math.max(0, parseInt(row.competitor_coverage) - parseInt(row.our_coverage)),
      gapScore: parseFloat(row.gap_score).toFixed(2)
    }));

    const topOpportunities = gaps.sort((a, b) => b.opportunity - a.opportunity).slice(0, 10);

    res.status(200).json({
      success: true,
      totalGaps: gaps.length,
      avgGapScore: (gaps.reduce((sum, g) => sum + parseFloat(g.gapScore), 0) / gaps.length).toFixed(2),
      topOpportunities,
      allGaps: gaps
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function monitorPageSpeed(req, res) {
  const client = await pool.connect();
  try {
    const { domain = process.env.DOMAIN } = req.body;

    const result = await client.query(
      `SELECT page_url, mobile_speed_score, desktop_speed_score,
       first_contentful_paint, largest_contentful_paint, cumulative_layout_shift,
       checked_at
       FROM page_speed_metrics
       WHERE domain = $1 AND checked_at > NOW() - interval '30 days'
       ORDER BY checked_at DESC`,
      [domain]
    );

    const pages = result.rows.map(row => ({
      pageUrl: row.page_url,
      mobileScore: parseInt(row.mobile_speed_score),
      desktopScore: parseInt(row.desktop_speed_score),
      fcp: parseFloat(row.first_contentful_paint).toFixed(2),
      lcp: parseFloat(row.largest_contentful_paint).toFixed(2),
      cls: parseFloat(row.cumulative_layout_shift).toFixed(3),
      checkedAt: row.checked_at
    }));

    const slowPages = pages.filter(p => p.mobileScore < 50 || p.desktopScore < 50);

    if (slowPages.length > 0) {
      try {
        await resend.emails.send({
          from: 'seo@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Page Speed Alert: ${slowPages.length} Pages Below 50 Score`,
          html: `
            <h2>Page Speed Issues</h2>
            <ul>
              ${slowPages.slice(0, 5).map(p => 
                `<li>${p.pageUrl} - Mobile: ${p.mobileScore}, Desktop: ${p.desktopScore}</li>`
              ).join('')}
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      totalPages: pages.length,
      slowPages: slowPages.length,
      avgMobileScore: (pages.reduce((sum, p) => sum + p.mobileScore, 0) / pages.length).toFixed(0),
      avgDesktopScore: (pages.reduce((sum, p) => sum + p.desktopScore, 0) / pages.length).toFixed(0),
      pages: pages.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function validateTechnicalSEO(req, res) {
  const client = await pool.connect();
  try {
    const { domain = process.env.DOMAIN } = req.body;

    const result = await client.query(
      `SELECT check_name, status, issues_found, recommendation, checked_at
       FROM technical_seo_checks
       WHERE domain = $1 AND checked_at > NOW() - interval '7 days'`,
      [domain]
    );

    const checks = result.rows.map(row => ({
      checkName: row.check_name,
      status: row.status,
      issuesFound: parseInt(row.issues_found),
      recommendation: row.recommendation,
      checkedAt: row.checked_at
    }));

    const failed = checks.filter(c => c.status === 'fail');
    const warnings = checks.filter(c => c.status === 'warning');

    res.status(200).json({
      success: true,
      totalChecks: checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      warnings: warnings.length,
      failed: failed.length,
      checks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function checkLocalCitations(req, res) {
  const client = await pool.connect();
  try {
    const { businessName = process.env.BUSINESS_NAME, city = '' } = req.body;

    const result = await client.query(
      `SELECT platform, business_name, address, phone_number, 
       consistency_score, last_verified
       FROM local_citations
       WHERE business_name = $1 AND city = $2`,
      [businessName, city]
    );

    const citations = result.rows.map(row => ({
      platform: row.platform,
      businessName: row.business_name,
      address: row.address,
      phone: row.phone_number,
      consistencyScore: parseInt(row.consistency_score),
      lastVerified: row.last_verified
    }));

    const inconsistent = citations.filter(c => c.consistencyScore < 80);
    const avgConsistency = (citations.reduce((sum, c) => sum + c.consistencyScore, 0) / Math.max(1, citations.length)).toFixed(0);

    if (inconsistent.length > 0) {
      try {
        await resend.emails.send({
          from: 'seo@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Citation Alert: ${inconsistent.length} Inconsistent NAP Listings`,
          html: `
            <h2>Local Citation Issues</h2>
            <p>Found ${inconsistent.length} listings with inconsistent NAP data.</p>
            <ul>
              ${inconsistent.slice(0, 5).map(c => 
                `<li><strong>${c.platform}</strong> - Score: ${c.consistencyScore}%</li>`
              ).join('')}
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      totalCitations: citations.length,
      avgConsistency,
      inconsistentCitations: inconsistent.length,
      citations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}