import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkUptime(domain) {
  try {
    const startTime = Date.now();
    const response = await fetch(`https://${domain}`, { timeout: 10000 });
    const responseTime = Date.now() - startTime;
    return {
      status: response.status,
      ok: response.ok,
      responseTime,
      timestamp: new Date()
    };
  } catch (error) {
    return { status: 'DOWN', error: error.message, timestamp: new Date() };
  }
}

async function backupFormSubmission(formId, formData, companyId) {
  const submissionId = require('crypto').randomUUID();
  await pool.query(
    `INSERT INTO form_submissions_backup (id, form_id, company_id, data, source_url, submitted_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [submissionId, formId, companyId, JSON.stringify(formData), formData.source_url || 'unknown']
  );
  return { submissionId, backed_up: true };
}

async function getPersonalizedContent(pageUrl, visitorSegment, companyId) {
  const result = await pool.query(
    `SELECT content, title, description FROM website_pages
     WHERE company_id = $1 AND url = $2 AND segment = $3`,
    [companyId, pageUrl, visitorSegment]
  );

  if (result.rows.length === 0) {
    return { default: true, message: 'Using default content' };
  }

  return result.rows[0];
}

async function aggregateAnalytics(companyId) {
  const result = await pool.query(
    `SELECT
      SUM(page_views) as total_views,
      SUM(unique_visitors) as total_visitors,
      AVG(bounce_rate) as avg_bounce_rate,
      SUM(conversions) as total_conversions,
      DATE(recorded_at) as date
     FROM analytics_summary
     WHERE company_id = $1 AND recorded_at > NOW() - INTERVAL '30 days'
     GROUP BY DATE(recorded_at)
     ORDER BY DATE DESC`,
    [companyId]
  );

  return { summary: result.rows, period: '30_days' };
}

async function monitorCDNPerformance(companyId) {
  const result = await pool.query(
    `SELECT
      endpoint,
      AVG(latency_ms) as avg_latency,
      MAX(latency_ms) as max_latency,
      COUNT(*) as requests,
      DATE(checked_at) as date
     FROM cdn_performance
     WHERE company_id = $1 AND checked_at > NOW() - INTERVAL '24 hours'
     GROUP BY endpoint, DATE(checked_at)`,
    [companyId]
  );

  return { performance: result.rows };
}

async function findBrokenPages(companyId) {
  const result = await pool.query(
    `SELECT url, http_status, title, last_checked
     FROM page_crawl_results
     WHERE company_id = $1 AND (http_status = 404 OR http_status = 500)
     AND last_checked > NOW() - INTERVAL '7 days'
     ORDER BY last_checked DESC`,
    [companyId]
  );

  return { broken_pages: result.rows, count: result.rows.length };
}

async function checkSiteSpeed(companyId) {
  const result = await pool.query(
    `SELECT
      page_url,
      load_time_ms,
      first_contentful_paint_ms,
      largest_contentful_paint_ms,
      cumulative_layout_shift,
      checked_at
     FROM page_speed_metrics
     WHERE company_id = $1
     ORDER BY checked_at DESC
     LIMIT 50`,
    [companyId]
  );

  const slowPages = result.rows.filter(p => p.load_time_ms > 3000);

  if (slowPages.length > 0) {
    await pool.query(
      `INSERT INTO website_alerts (company_id, alert_type, severity, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [companyId, 'SLOW_PAGES', 'medium', JSON.stringify(slowPages)]
    );
  }

  return {
    metrics: result.rows,
    slow_pages: slowPages,
    average_load_time: result.rows.reduce((a, b) => a + b.load_time_ms, 0) / result.rows.length
  };
}

async function logWebsiteHealth(companyId, healthData) {
  await pool.query(
    `INSERT INTO website_health_logs (company_id, uptime_status, cdn_latency, page_load_time, error_count, crawl_coverage, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      companyId,
      healthData.uptimeStatus || 'OK',
      healthData.cdnLatency || 0,
      healthData.pageLoadTime || 0,
      healthData.errorCount || 0,
      healthData.crawlCoverage || 0
    ]
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, domain, companyId, formId, formData, pageUrl, visitorSegment } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    let response;

    switch (action) {
      case 'uptime_check':
        if (!domain) {
          return res.status(400).json({ error: 'Missing domain' });
        }
        const uptime = await checkUptime(domain);
        await pool.query(
          'INSERT INTO uptime_checks (domain, status, response_time, checked_at) VALUES ($1, $2, $3, NOW())',
          [domain, uptime.ok ? 'UP' : 'DOWN', uptime.responseTime || null]
        );
        response = { success: true, uptime };
        break;

      case 'backup_form':
        if (!formId || !formData || !companyId) {
          return res.status(400).json({ error: 'Missing formId, formData, or companyId' });
        }
        response = await backupFormSubmission(formId, formData, companyId);
        break;

      case 'personalized_content':
        if (!pageUrl || !visitorSegment || !companyId) {
          return res.status(400).json({ error: 'Missing pageUrl, visitorSegment, or companyId' });
        }
        response = await getPersonalizedContent(pageUrl, visitorSegment, companyId);
        break;

      case 'analytics_aggregator':
        if (!companyId) {
          return res.status(400).json({ error: 'Missing companyId' });
        }
        response = await aggregateAnalytics(companyId);
        break;

      case 'cdn_monitor':
        if (!companyId) {
          return res.status(400).json({ error: 'Missing companyId' });
        }
        response = await monitorCDNPerformance(companyId);
        break;

      case 'find_404s':
        if (!companyId) {
          return res.status(400).json({ error: 'Missing companyId' });
        }
        response = await findBrokenPages(companyId);
        break;

      case 'site_speed':
        if (!companyId) {
          return res.status(400).json({ error: 'Missing companyId' });
        }
        response = await checkSiteSpeed(companyId);
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(200).json({ success: true, ...response });
  } catch (error) {
    console.error('Website ops error:', error);
    return res.status(500).json({
      error: 'Website operations check failed',
      message: error.message
    });
  }
}
