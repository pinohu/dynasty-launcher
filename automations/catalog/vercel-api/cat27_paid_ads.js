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
      case 'monitor_budget':
        return await monitorBudgetPacing(req, res);
      case 'manage_ab_test':
        return await manageABTest(req, res);
      case 'harvest_negatives':
        return await harvestNegativeKeywords(req, res);
      case 'build_retargeting':
        return await buildRetargetingAudience(req, res);
      case 'calculate_roas':
        return await calculateROAS(req, res);
      case 'automation_campaigns':
        return await automateCapaignPauseResume(req, res);
      case 'track_landing_pages':
        return await trackLandingPagePerformance(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function monitorBudgetPacing(req, res) {
  const client = await pool.connect();
  try {
    const { campaignId, monthlyBudget, daysRemaining } = req.body;

    if (!campaignId || !monthlyBudget) {
      return res.status(400).json({ error: 'campaignId and monthlyBudget required' });
    }

    const result = await client.query(
      `SELECT SUM(cost) as total_spent, COUNT(*) as impressions
       FROM ad_metrics
       WHERE campaign_id = $1 AND DATE(date) = CURRENT_DATE`,
      [campaignId]
    );

    const spent = parseFloat(result.rows[0]?.total_spent || 0);
    const remainingDays = daysRemaining || 
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
    const dailyBudget = monthlyBudget / 30;
    const idealDailySpend = monthlyBudget / remainingDays;
    const pace = (spent / dailyBudget * 100).toFixed(2);

    let recommendation = 'On pace';
    if (pace > 120) {
      recommendation = 'SLOW - Reduce bids or daily budget';
    } else if (pace < 80) {
      recommendation = 'ACCELERATE - Increase bids or expand targeting';
    }

    if (pace > 120 || pace < 80) {
      try {
        await resend.emails.send({
          from: 'ads@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Ad Budget Alert: Campaign ${campaignId} - ${recommendation}`,
          html: `
            <h2>Budget Pacing Alert</h2>
            <p><strong>Campaign:</strong> ${campaignId}</p>
            <p><strong>Today's Spend:</strong> $${spent.toFixed(2)}</p>
            <p><strong>Pace:</strong> ${pace}% of daily budget</p>
            <p><strong>Recommendation:</strong> ${recommendation}</p>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    await client.query(
      `INSERT INTO budget_pacing_reports (campaign_id, daily_spend, pace, recommendation, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [campaignId, spent, pace, recommendation]
    );

    res.status(200).json({
      success: true,
      campaignId,
      dailySpend: spent,
      pace: parseFloat(pace),
      recommendation,
      monthlyBudget,
      idealDailySpend: idealDailySpend.toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function manageABTest(req, res) {
  const client = await pool.connect();
  try {
    const { testId, variants = [], minimumSampleSize = 1000, confidenceLevel = 0.95 } = req.body;

    if (!testId || variants.length < 2) {
      return res.status(400).json({ error: 'testId and at least 2 variants required' });
    }

    const result = await client.query(
      `SELECT variant, COUNT(*) as impressions, SUM(clicks) as clicks,
       SUM(conversions) as conversions, SUM(cost) as cost
       FROM ab_test_metrics
       WHERE test_id = $1
       GROUP BY variant`,
      [testId]
    );

    const metrics = result.rows.map(row => ({
      variant: row.variant,
      impressions: parseInt(row.impressions),
      clicks: parseInt(row.clicks) || 0,
      conversions: parseInt(row.conversions) || 0,
      cost: parseFloat(row.cost) || 0,
      ctr: ((parseInt(row.clicks) / parseInt(row.impressions)) * 100).toFixed(2),
      conversionRate: ((parseInt(row.conversions) / Math.max(1, parseInt(row.clicks))) * 100).toFixed(2),
      cpc: (parseFloat(row.cost) / Math.max(1, parseInt(row.clicks))).toFixed(2),
      cpa: (parseFloat(row.cost) / Math.max(1, parseInt(row.conversions))).toFixed(2)
    }));

    // Determine winner (highest conversion rate with sufficient sample size)
    let winner = null;
    if (metrics.every(m => m.impressions >= minimumSampleSize)) {
      winner = metrics.reduce((prev, current) => 
        parseFloat(current.conversionRate) > parseFloat(prev.conversionRate) ? current : prev
      );
    }

    await client.query(
      `INSERT INTO ab_test_results (test_id, variants_data, winner, confidence_level, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [testId, JSON.stringify(metrics), winner ? winner.variant : null, confidenceLevel]
    );

    res.status(200).json({
      success: true,
      testId,
      variants: metrics,
      winner,
      sampleSizeReached: metrics.every(m => m.impressions >= minimumSampleSize)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function harvestNegativeKeywords(req, res) {
  const client = await pool.connect();
  try {
    const { campaignId, threshold = 0.03 } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    const result = await client.query(
      `SELECT keyword, impressions, clicks, conversions, cost
       FROM search_terms
       WHERE campaign_id = $1 AND created_at > NOW() - interval '30 days'
       ORDER BY impressions DESC`,
      [campaignId]
    );

    const terms = result.rows;
    const negativeKeywords = terms.filter(t => {
      const conversionRate = parseInt(t.conversions) / Math.max(1, parseInt(t.clicks));
      return conversionRate < threshold || (parseInt(t.impressions) > 100 && parseInt(t.conversions) === 0);
    });

    // Add negative keywords to campaign
    if (negativeKeywords.length > 0) {
      await Promise.all(
        negativeKeywords.map(nk =>
          client.query(
            `INSERT INTO negative_keywords (campaign_id, keyword, added_at)
             VALUES ($1, $2, NOW())`,
            [campaignId, nk.keyword]
          )
        )
      );

      try {
        await resend.emails.send({
          from: 'ads@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Added ${negativeKeywords.length} Negative Keywords to Campaign ${campaignId}`,
          html: `
            <h2>Negative Keywords Harvested</h2>
            <p>Added ${negativeKeywords.length} negative keywords based on poor performance.</p>
            <ul>
              ${negativeKeywords.slice(0, 10).map(k => 
                `<li>"${k.keyword}" - ${k.conversions}/${k.clicks} conversions</li>`
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
      campaignId,
      negativeKeywordsAdded: negativeKeywords.length,
      keywords: negativeKeywords.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function buildRetargetingAudience(req, res) {
  const client = await pool.connect();
  try {
    const { audienceName, segmentType = 'abandonment', daysLookback = 30 } = req.body;

    if (!audienceName) {
      return res.status(400).json({ error: 'audienceName required' });
    }

    let query = '';
    let params = [];

    switch (segmentType) {
      case 'abandonment':
        query = `SELECT DISTINCT user_id FROM user_sessions 
                 WHERE last_event = 'estimate_abandoned' 
                 AND created_at > NOW() - interval '${daysLookback} days'`;
        break;
      case 'cart_viewers':
        query = `SELECT DISTINCT user_id FROM user_sessions 
                 WHERE page_viewed LIKE '%cart%' 
                 AND conversion = false
                 AND created_at > NOW() - interval '${daysLookback} days'`;
        break;
      case 'past_customers':
        query = `SELECT DISTINCT client_id as user_id FROM jobs 
                 WHERE status = 'completed'
                 AND created_at > NOW() - interval '${daysLookback} days'`;
        break;
      case 'high_value':
        query = `SELECT DISTINCT user_id FROM user_sessions 
                 WHERE session_value > 500
                 AND conversion = false
                 AND created_at > NOW() - interval '${daysLookback} days'`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid segmentType' });
    }

    const result = await client.query(query, params);
    const audienceSize = result.rows.length;

    await client.query(
      `INSERT INTO retargeting_audiences (name, segment_type, audience_size, days_lookback, synced_at, created_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [audienceName, segmentType, audienceSize, daysLookback]
    );

    res.status(201).json({
      success: true,
      audienceName,
      segmentType,
      audienceSize,
      message: `Created retargeting audience with ${audienceSize} users`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function calculateROAS(req, res) {
  const client = await pool.connect();
  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    const result = await client.query(
      `SELECT SUM(cost) as total_spend, SUM(revenue) as total_revenue,
       SUM(conversions) as conversions, COUNT(*) as clicks
       FROM ad_metrics
       WHERE campaign_id = $1 AND created_at > NOW() - interval '30 days'`,
      [campaignId]
    );

    const row = result.rows[0];
    const spend = parseFloat(row.total_spend) || 0;
    const revenue = parseFloat(row.total_revenue) || 0;
    const roas = spend > 0 ? (revenue / spend).toFixed(2) : 0;
    const conversions = parseInt(row.conversions) || 0;
    const cpa = conversions > 0 ? (spend / conversions).toFixed(2) : 0;

    // ROAS threshold alerts
    const roasThreshold = 2.5; // 2.5:1 is typical target
    let status = 'good';
    if (parseFloat(roas) < 1) {
      status = 'critical';
    } else if (parseFloat(roas) < roasThreshold) {
      status = 'warning';
    }

    if (status !== 'good') {
      try {
        await resend.emails.send({
          from: 'ads@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `ROAS Alert: Campaign ${campaignId} - ${status.toUpperCase()}`,
          html: `
            <h2>ROAS Performance Alert</h2>
            <p><strong>Campaign:</strong> ${campaignId}</p>
            <p><strong>Spend:</strong> $${spend.toFixed(2)}</p>
            <p><strong>Revenue:</strong> $${revenue.toFixed(2)}</p>
            <p><strong>ROAS:</strong> ${roas}:1 (${status})</p>
            <p><strong>Conversions:</strong> ${conversions}</p>
            <p><strong>CPA:</strong> $${cpa}</p>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    await client.query(
      `INSERT INTO roas_reports (campaign_id, spend, revenue, roas, cpa, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [campaignId, spend, revenue, roas, cpa, status]
    );

    res.status(200).json({
      success: true,
      campaignId,
      spend: spend.toFixed(2),
      revenue: revenue.toFixed(2),
      roas: parseFloat(roas),
      conversions,
      cpa: parseFloat(cpa),
      status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function automateCapaignPauseResume(req, res) {
  const client = await pool.connect();
  try {
    const { criteria = {} } = req.body;

    // Default thresholds
    const minROAS = criteria.minROAS || 1.5;
    const maxCPA = criteria.maxCPA || 100;
    const minCTR = criteria.minCTR || 0.01;

    const result = await client.query(
      `SELECT id, name, 
       (SELECT SUM(revenue) FROM ad_metrics WHERE campaign_id = c.id AND created_at > NOW() - interval '7 days') as revenue,
       (SELECT SUM(cost) FROM ad_metrics WHERE campaign_id = c.id AND created_at > NOW() - interval '7 days') as cost,
       (SELECT SUM(conversions) FROM ad_metrics WHERE campaign_id = c.id AND created_at > NOW() - interval '7 days') as conversions,
       (SELECT SUM(clicks) FROM ad_metrics WHERE campaign_id = c.id AND created_at > NOW() - interval '7 days') as clicks,
       (SELECT SUM(impressions) FROM ad_metrics WHERE campaign_id = c.id AND created_at > NOW() - interval '7 days') as impressions,
       status
       FROM campaigns c`
    );

    const changes = [];

    for (const campaign of result.rows) {
      const spend = parseFloat(campaign.cost) || 0;
      const revenue = parseFloat(campaign.revenue) || 0;
      const conversions = parseInt(campaign.conversions) || 0;
      const clicks = parseInt(campaign.clicks) || 0;
      const impressions = parseInt(campaign.impressions) || 0;

      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = conversions > 0 ? spend / conversions : 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;

      let shouldPause = false;
      let reason = '';

      if (roas < minROAS && spend > 100) {
        shouldPause = true;
        reason = `Low ROAS: ${roas.toFixed(2)}`;
      } else if (cpa > maxCPA && conversions > 5) {
        shouldPause = true;
        reason = `High CPA: $${cpa.toFixed(2)}`;
      } else if (ctr < minCTR && impressions > 1000) {
        shouldPause = true;
        reason = `Low CTR: ${(ctr * 100).toFixed(2)}%`;
      }

      if (shouldPause && campaign.status === 'active') {
        await client.query(
          `UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1`,
          [campaign.id]
        );

        changes.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          action: 'paused',
          reason
        });
      } else if (!shouldPause && campaign.status === 'paused') {
        await client.query(
          `UPDATE campaigns SET status = 'active', updated_at = NOW() WHERE id = $1`,
          [campaign.id]
        );

        changes.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          action: 'resumed'
        });
      }
    }

    if (changes.length > 0) {
      try {
        await resend.emails.send({
          from: 'ads@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Campaign Automation: ${changes.length} Changes Made`,
          html: `
            <h2>Campaign Automation Report</h2>
            <p>Made ${changes.length} automated changes.</p>
            <ul>
              ${changes.map(c => 
                `<li><strong>${c.campaignName}</strong> - ${c.action.toUpperCase()} (${c.reason || ''})</li>`
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
      changesCount: changes.length,
      changes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function trackLandingPagePerformance(req, res) {
  const client = await pool.connect();
  try {
    const { domain = process.env.DOMAIN } = req.body;

    const result = await client.query(
      `SELECT page_url, visits, unique_visitors, conversions, 
       bounce_rate, avg_session_duration, tracked_at
       FROM landing_page_metrics
       WHERE domain = $1 AND tracked_at > NOW() - interval '30 days'
       ORDER BY conversions DESC`
    );

    const pages = result.rows.map(row => ({
      pageUrl: row.page_url,
      visits: parseInt(row.visits),
      uniqueVisitors: parseInt(row.unique_visitors),
      conversions: parseInt(row.conversions),
      bounceRate: parseFloat(row.bounce_rate).toFixed(2),
      avgSessionDuration: parseFloat(row.avg_session_duration).toFixed(1),
      conversionRate: ((parseInt(row.conversions) / Math.max(1, parseInt(row.visits))) * 100).toFixed(2),
      trackedAt: row.tracked_at
    }));

    const topPerformers = pages.sort((a, b) => parseFloat(b.conversionRate) - parseFloat(a.conversionRate)).slice(0, 5);
    const underperformers = pages.filter(p => parseFloat(p.conversionRate) < 1);

    res.status(200).json({
      success: true,
      totalPages: pages.length,
      topPerformers,
      underperformers: underperformers.slice(0, 5),
      allPages: pages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}