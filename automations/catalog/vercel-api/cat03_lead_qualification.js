import { Router } from 'express';
import { db } from '../lib/db.js';
import { sendEmailViaAcumbamail } from '../lib/messaging.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// 1. Update lead score
router.post('/update-score', async (req, res) => {
  try {
    const { leadId, email, totalScore, components } = req.body;

    if (!leadId || totalScore === undefined) {
      return res.status(400).json({ success: false, error: 'Missing leadId or score' });
    }

    const updateQuery = `
      UPDATE leads
      SET engagement_score = $1, score_components = $2, score_updated_at = NOW()
      WHERE id = $3
      RETURNING id, engagement_score, status;
    `;

    const result = await db.query(updateQuery, [
      Math.min(totalScore, 100),
      JSON.stringify(components || {}),
      leadId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const lead = result.rows[0];
    const newStatus = lead.engagement_score >= 70 ? 'warm' : lead.engagement_score >= 40 ? 'lukewarm' : 'cold';

    res.status(200).json({
      success: true,
      leadId,
      score: lead.engagement_score,
      status: newStatus,
      components
    });

  } catch (error) {
    console.error('Error updating score:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Check budget qualification
router.post('/check-budget', async (req, res) => {
  try {
    const { leadId, email, serviceType, estimateRange, budgetQualified } = req.body;

    if (!leadId || !serviceType) {
      return res.status(400).json({ success: false, error: 'Missing leadId or serviceType' });
    }

    const budgetMap = {
      hvac: { min: 500, max: 5000, avg: 2000 },
      plumbing: { min: 300, max: 3000, avg: 1000 },
      pest: { min: 150, max: 500, avg: 300 },
      electrical: { min: 500, max: 10000, avg: 3000 }
    };

    const budgetRange = budgetMap[serviceType] || { min: 200, max: 5000, avg: 2000 };
    const isQualified = budgetQualified !== undefined ? budgetQualified : true;

    const updateQuery = `
      UPDATE leads
      SET budget_qualified = $1, estimated_budget = $2, service_type = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, budget_qualified;
    `;

    await db.query(updateQuery, [
      isQualified,
      estimateRange || budgetRange.avg,
      serviceType,
      leadId
    ]);

    res.status(200).json({
      success: true,
      leadId,
      serviceType,
      budgetQualified: isQualified,
      expectedRange: budgetRange,
      estimatedValue: estimateRange || budgetRange.avg
    });

  } catch (error) {
    console.error('Error checking budget:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Detect urgency
router.post('/detect-urgency', async (req, res) => {
  try {
    const { leadId, email, isUrgent, urgencyScore } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const updateQuery = `
      UPDATE leads
      SET is_urgent = $1, urgency_score = $2, priority = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, is_urgent, urgency_score;
    `;

    const priority = isUrgent ? 'high' : 'normal';
    const score = urgencyScore !== undefined ? urgencyScore : (isUrgent ? 85 : 30);

    await db.query(updateQuery, [isUrgent || false, score, priority, leadId]);

    res.status(200).json({
      success: true,
      leadId,
      email,
      isUrgent: isUrgent || false,
      urgencyScore: score,
      priority,
      responseTime: isUrgent ? '< 15 minutes' : '< 2 hours'
    });

  } catch (error) {
    console.error('Error detecting urgency:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Geo-qualify lead
router.post('/geo-qualify', async (req, res) => {
  try {
    const { leadId, email, serviceType, location, geoQualified, distance } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const updateQuery = `
      UPDATE leads
      SET geo_qualified = $1, service_area = $2, location = $3, distance_miles = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING id, geo_qualified;
    `;

    const qualified = geoQualified !== undefined ? geoQualified : true;

    await db.query(updateQuery, [
      qualified,
      true,
      location || null,
      distance || null,
      leadId
    ]);

    res.status(200).json({
      success: true,
      leadId,
      email,
      geoQualified: qualified,
      location,
      distance,
      serviceType,
      message: qualified ? 'Within service area' : 'Outside service area'
    });

  } catch (error) {
    console.error('Error geo-qualifying:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Check for duplicate leads
router.post('/check-duplicate', async (req, res) => {
  try {
    const { leadId, email, phone } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const query = `
      SELECT id, email, phone, first_name, last_name, created_at
      FROM leads
      WHERE (LOWER(email) = LOWER($1) OR phone = $2) AND id != $3
      LIMIT 5;
    `;

    const result = await db.query(query, [email || '', phone || '', leadId]);
    const duplicates = result.rows;

    res.status(200).json({
      success: true,
      leadId,
      isDuplicate: duplicates.length > 0,
      duplicateCount: duplicates.length,
      candidates: duplicates,
      action: duplicates.length > 0 ? 'merge_recommended' : 'no_duplicates'
    });

  } catch (error) {
    console.error('Error checking duplicates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Score lead source quality
router.post('/score-source', async (req, res) => {
  try {
    const { source, leadCount, convertedCount, quality } = req.body;

    if (!source) {
      return res.status(400).json({ success: false, error: 'Missing source' });
    }

    const conversionRate = leadCount > 0 ? ((convertedCount || 0) / leadCount) * 100 : 0;

    const updateQuery = `
      INSERT INTO source_analytics (source, total_leads, converted_leads, conversion_rate, quality_score, last_updated)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT(source) DO UPDATE SET
        total_leads = source_analytics.total_leads + $2,
        converted_leads = source_analytics.converted_leads + $3,
        conversion_rate = ((source_analytics.converted_leads + $3) / (source_analytics.total_leads + $2)) * 100,
        quality_score = $5,
        last_updated = NOW()
      RETURNING source, conversion_rate, quality_score;
    `;

    const result = await db.query(updateQuery, [
      source,
      leadCount || 1,
      convertedCount || 0,
      conversionRate,
      quality || 'medium'
    ]);

    const data = result.rows[0];

    res.status(200).json({
      success: true,
      source,
      leadCount,
      conversionRate: data.conversion_rate.toFixed(2),
      quality: data.quality_score,
      recommendation: data.conversion_rate > 15 ? 'increase_investment' : data.conversion_rate > 5 ? 'maintain' : 'reduce_investment'
    });

  } catch (error) {
    console.error('Error scoring source:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Score behavioral intent
router.post('/score-behavioral', async (req, res) => {
  try {
    const { leadId, email, behavioralScore, intent, pageViews, emailOpens, emailClicks, estimateViews, bookingViews } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    const updateQuery = `
      UPDATE leads
      SET behavioral_score = $1, purchase_intent = $2, engagement_metrics = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, behavioral_score;
    `;

    const metrics = JSON.stringify({
      pageViews: pageViews || 0,
      emailOpens: emailOpens || 0,
      emailClicks: emailClicks || 0,
      estimateViews: estimateViews || 0,
      bookingViews: bookingViews || 0
    });

    await db.query(updateQuery, [
      behavioralScore || 50,
      intent || 'medium',
      metrics,
      leadId
    ]);

    res.status(200).json({
      success: true,
      leadId,
      email,
      behavioralScore: behavioralScore || 50,
      intent: intent || 'medium',
      engagementMetrics: { pageViews, emailOpens, emailClicks, estimateViews, bookingViews }
    });

  } catch (error) {
    console.error('Error scoring behavioral:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Auto-disqualify lead
router.post('/auto-disqualify', async (req, res) => {
  try {
    const { leadId, email, shouldDisqualify, issues, reason } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing leadId' });
    }

    if (shouldDisqualify) {
      const updateQuery = `
        UPDATE leads
        SET status = 'disqualified', disqualification_reason = $1, disqualified_at = NOW()
        WHERE id = $2
        RETURNING id, status;
      `;

      await db.query(updateQuery, [reason || JSON.stringify(issues), leadId]);

      res.status(200).json({
        success: true,
        leadId,
        email,
        disqualified: true,
        reason,
        issues
      });
    } else {
      res.status(200).json({
        success: true,
        leadId,
        email,
        disqualified: false,
        message: 'Lead remains qualified'
      });
    }

  } catch (error) {
    console.error('Error auto-disqualifying:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Handoff qualified lead to sales
router.post('/handoff-sales', async (req, res) => {
  try {
    const { leadId, email, totalScore, isSalesReady, assignmentPriority } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    if (!isSalesReady) {
      return res.status(400).json({
        success: false,
        error: 'Lead not ready for sales handoff',
        score: totalScore,
        requiredScore: 70
      });
    }

    const updateQuery = `
      UPDATE leads
      SET status = 'sales_ready', handoff_date = NOW(), sales_priority = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, status, handoff_date;
    `;

    const result = await db.query(updateQuery, [assignmentPriority || 'normal', leadId]);

    const taskQuery = `
      INSERT INTO sales_tasks (lead_id, task_type, priority, status, due_date, created_at)
      VALUES ($1, 'initial_contact', $2, 'pending', NOW() + INTERVAL '1 hour', NOW())
      RETURNING id;
    `;

    const taskResult = await db.query(taskQuery, [leadId, assignmentPriority === 'high' ? 'high' : 'normal']);

    res.status(200).json({
      success: true,
      leadId,
      email,
      handoffStatus: 'completed',
      salesReady: true,
      taskId: taskResult.rows[0].id,
      priority: assignmentPriority,
      score: totalScore,
      message: 'Lead assigned to sales team'
    });

  } catch (error) {
    console.error('Error handing off lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Send quality report
router.post('/send-quality-report', async (req, res) => {
  try {
    const query = `
      SELECT
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'sales_ready' THEN 1 ELSE 0 END) as qualified_leads,
        ROUND(AVG(engagement_score), 2) as avg_engagement_score,
        SUM(CASE WHEN is_urgent THEN 1 ELSE 0 END) as urgent_leads,
        SUM(CASE WHEN status = 'disqualified' THEN 1 ELSE 0 END) as disqualified_leads,
        source,
        DATE(created_at) as date
      FROM leads
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY source, DATE(created_at)
      ORDER BY date DESC;
    `;

    const result = await db.query(query);

    const reportData = {
      period: 'weekly',
      reportDate: new Date().toISOString(),
      summary: {
        totalLeads: result.rows.reduce((sum, row) => sum + parseInt(row.total_leads), 0),
        qualifiedLeads: result.rows.reduce((sum, row) => sum + parseInt(row.qualified_leads || 0), 0),
        avgScore: (result.rows.reduce((sum, row) => sum + parseFloat(row.avg_engagement_score || 0), 0) / result.rows.length).toFixed(2),
        urgentLeads: result.rows.reduce((sum, row) => sum + parseInt(row.urgent_leads || 0), 0),
        disqualifiedLeads: result.rows.reduce((sum, row) => sum + parseInt(row.disqualified_leads || 0), 0)
      },
      bySource: result.rows
    };

    // Send email report
    await sendEmailViaAcumbamail({
      recipient: process.env.ADMIN_EMAIL,
      subject: 'Dynasty Empire - Weekly Lead Quality Report',
      html: `
        <h2>Lead Quality Report</h2>
        <p>Period: Last 7 days</p>
        <ul>
          <li>Total Leads: ${reportData.summary.totalLeads}</li>
          <li>Qualified Leads: ${reportData.summary.qualifiedLeads}</li>
          <li>Avg Score: ${reportData.summary.avgScore}</li>
          <li>Urgent Leads: ${reportData.summary.urgentLeads}</li>
          <li>Disqualified: ${reportData.summary.disqualifiedLeads}</li>
        </ul>
      `,
      tags: ['report', 'quality', 'weekly']
    });

    res.status(200).json({
      success: true,
      reportGenerated: true,
      period: 'weekly',
      data: reportData
    });

  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Get qualification metrics
router.get('/metrics', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const query = `
      SELECT
        COUNT(*) as total_leads,
        SUM(CASE WHEN engagement_score >= 70 THEN 1 ELSE 0 END) as high_quality_leads,
        SUM(CASE WHEN is_urgent THEN 1 ELSE 0 END) as urgent_count,
        SUM(CASE WHEN geo_qualified THEN 1 ELSE 0 END) as geo_qualified_count,
        SUM(CASE WHEN budget_qualified THEN 1 ELSE 0 END) as budget_qualified_count,
        ROUND(AVG(engagement_score), 2) as avg_score,
        ROUND(SUM(CASE WHEN status = 'sales_ready' THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as qualification_rate
      FROM leads
      WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days';
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      period: `${days}_days`,
      metrics: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;