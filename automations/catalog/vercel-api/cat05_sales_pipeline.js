import { Router } from 'express';
import { db } from '../lib/db.js';
import { sendEmailViaAcumbamail, sendSMS } from '../lib/messaging.js';
import { sendPushNotification } from '../lib/notifications.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// 1. Speed-to-lead response
router.post('/speed-to-lead', async (req, res) => {
  try {
    const { leadId, email, phone, firstName, withinSLA, priority, contactChannels } = req.body;

    if (!leadId || !email) {
      return res.status(400).json({ success: false, error: 'Missing leadId or email' });
    }

    const contacts = [];

    // Send multi-channel outreach
    if (contactChannels.includes('email')) {
      await sendEmailViaAcumbamail({
        recipient: email,
        subject: 'Thank you for reaching out!',
        html: '<p>We received your inquiry and will be in touch shortly!</p>',
        tags: ['speed_to_lead', 'first_touch']
      });
      contacts.push({ channel: 'email', sent: true });
    }

    if (contactChannels.includes('sms') && phone) {
      await sendSMS({
        to: phone,
        message: `Thanks for contacting us! A specialist will reach out soon.`
      });
      contacts.push({ channel: 'sms', sent: true });
    }

    // Create task for rep
    const taskQuery = `
      INSERT INTO sales_tasks (lead_id, task_type, priority, status, due_date, created_at)
      VALUES ($1, 'initial_contact', $2, 'pending', NOW() + INTERVAL '15 minutes', NOW())
      RETURNING id;
    `;

    const result = await db.query(taskQuery, [leadId, priority]);

    res.status(200).json({
      success: true,
      leadId,
      email,
      withinSLA,
      contactsSent: contacts.length,
      details: contacts,
      taskId: result.rows[0].id,
      timeToContact: '< 15 minutes'
    });

    await logAudit({
      action: 'speed_to_lead_initiated',
      leadId,
      channels: contacts.map(c => c.channel)
    });

  } catch (error) {
    console.error('Error initiating speed-to-lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Schedule follow-up
router.post('/schedule-followup', async (req, res) => {
  try {
    const { dealId, email, currentTouch, nextTouch, totalTouches } = req.body;

    if (!dealId || !email || !nextTouch) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const followupDate = new Date();
    followupDate.setDate(followupDate.getDate() + nextTouch.delay);

    const insertQuery = `
      INSERT INTO followup_tasks (deal_id, email, contact_method, message, scheduled_date, touch_number, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
      RETURNING id, scheduled_date;
    `;

    const result = await db.query(insertQuery, [
      dealId,
      email,
      nextTouch.type,
      nextTouch.subject || nextTouch.message,
      followupDate.toISOString(),
      currentTouch
    ]);

    res.status(200).json({
      success: true,
      dealId,
      email,
      touchNumber: currentTouch,
      nextFollowupDate: followupDate.toISOString(),
      contactMethod: nextTouch.type,
      taskId: result.rows[0].id,
      sequenceProgress: `${currentTouch}/${totalTouches}`
    });

  } catch (error) {
    console.error('Error scheduling followup:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Alert on stale deals
router.post('/alert-stale', async (req, res) => {
  try {
    const { dealId, daysSinceActivity, isStale, alertLevel, actionItems } = req.body;

    if (!dealId) {
      return res.status(400).json({ success: false, error: 'Missing dealId' });
    }

    if (isStale) {
      // Get deal and rep info
      const dealQuery = `
        SELECT d.id, d.lead_id, d.deal_value, d.assigned_rep, r.email as rep_email
        FROM deals d
        LEFT JOIN sales_reps r ON d.assigned_rep = r.id
        WHERE d.id = $1;
      `;

      const dealResult = await db.query(dealQuery, [dealId]);
      const deal = dealResult.rows[0];

      if (deal && deal.rep_email) {
        await sendEmailViaAcumbamail({
          recipient: deal.rep_email,
          subject: `Alert: Stale Deal - ${daysSinceActivity} days without activity`,
          html: `
            <p>Deal ${dealId} has been inactive for ${daysSinceActivity} days.</p>
            <p>Recommended actions:</p>
            <ul>
              ${actionItems.map(item => `<li>${item}</li>`).join('')}
            </ul>
          `,
          tags: ['stale_deal', 'sales_alert']
        });
      }

      // Update deal status
      const updateQuery = `
        UPDATE deals
        SET status = $1, last_alert_date = NOW(), alert_count = COALESCE(alert_count, 0) + 1
        WHERE id = $2
        RETURNING id;
      `;

      await db.query(updateQuery, [alertLevel === 'critical' ? 'at_risk' : 'inactive', dealId]);

      res.status(200).json({
        success: true,
        dealId,
        alerted: true,
        daysSinceActivity,
        alertLevel,
        actionItems
      });
    } else {
      res.status(200).json({
        success: true,
        dealId,
        alerted: false,
        message: 'Deal is active'
      });
    }

  } catch (error) {
    console.error('Error alerting stale deal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Advance pipeline stage
router.post('/advance-stage', async (req, res) => {
  try {
    const { dealId, fromStage, toStage, dealValue, isValidAdvancement, updatePipeline } = req.body;

    if (!dealId || !toStage) {
      return res.status(400).json({ success: false, error: 'Missing dealId or toStage' });
    }

    if (!isValidAdvancement) {
      return res.status(400).json({ success: false, error: 'Invalid stage advancement' });
    }

    const updateQuery = `
      UPDATE deals
      SET stage = $1, stage_updated_at = NOW(), updated_at = NOW()
      WHERE id = $2
      RETURNING id, stage;
    `;

    const result = await db.query(updateQuery, [toStage, dealId]);

    res.status(200).json({
      success: true,
      dealId,
      previousStage: fromStage,
      newStage: toStage,
      dealValue,
      advanced: true
    });

  } catch (error) {
    console.error('Error advancing stage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Log win/loss outcome
router.post('/log-outcome', async (req, res) => {
  try {
    const { dealId, outcome, isWin, dealValue, closedDate, repId, revenueImpact } = req.body;

    if (!dealId || !outcome) {
      return res.status(400).json({ success: false, error: 'Missing dealId or outcome' });
    }

    const updateQuery = `
      UPDATE deals
      SET outcome = $1, status = $2, closed_date = $3, closed_amount = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING id, outcome;
    `;

    const status = isWin ? 'won' : 'lost';
    const amount = isWin ? dealValue : 0;

    await db.query(updateQuery, [outcome, status, closedDate, amount, dealId]);

    // Update rep performance
    if (repId) {
      const repQuery = `
        UPDATE sales_reps
        SET total_closed = total_closed + $1, total_deals = total_deals + 1, updated_at = NOW()
        WHERE id = $2;
      `;
      await db.query(repQuery, [isWin ? 1 : 0, repId]);
    }

    res.status(200).json({
      success: true,
      dealId,
      outcome,
      isWin,
      dealValue,
      closedDate,
      revenueImpact
    });

  } catch (error) {
    console.error('Error logging outcome:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Track objection
router.post('/track-objection', async (req, res) => {
  try {
    const { dealId, objectionType, suggestedResponse } = req.body;

    if (!dealId || !objectionType) {
      return res.status(400).json({ success: false, error: 'Missing dealId or objectionType' });
    }

    const insertQuery = `
      INSERT INTO objections (deal_id, objection_type, suggested_response, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id;
    `;

    const result = await db.query(insertQuery, [dealId, objectionType, suggestedResponse]);

    res.status(200).json({
      success: true,
      dealId,
      objectionType,
      suggestedResponse,
      objectionId: result.rows[0].id
    });

  } catch (error) {
    console.error('Error tracking objection:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Detect competitor mention
router.post('/detect-competitor', async (req, res) => {
  try {
    const { dealId, competitorsMentioned, hasCompetitorMention, action } = req.body;

    if (!dealId) {
      return res.status(400).json({ success: false, error: 'Missing dealId' });
    }

    if (hasCompetitorMention) {
      const updateQuery = `
        UPDATE deals
        SET competitors_mentioned = $1, competitor_alert_sent = true, updated_at = NOW()
        WHERE id = $2
        RETURNING id;
      `;

      await db.query(updateQuery, [JSON.stringify(competitorsMentioned), dealId]);

      // Alert sales manager
      const managerQuery = `SELECT email FROM sales_managers LIMIT 1;`;
      const managerResult = await db.query(managerQuery);

      if (managerResult.rows[0]) {
        await sendEmailViaAcumbamail({
          recipient: managerResult.rows[0].email,
          subject: `Competitor Alert: Deal ${dealId}`,
          html: `<p>Competitors mentioned: ${competitorsMentioned.join(', ')}</p><p>Please review and provide counter-strategies.</p>`,
          tags: ['competitor_alert', 'urgent']
        });
      }
    }

    res.status(200).json({
      success: true,
      dealId,
      competitorsMentioned,
      alertSent: hasCompetitorMention,
      action
    });

  } catch (error) {
    console.error('Error detecting competitor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. Update deal forecast
router.post('/forecast-value', async (req, res) => {
  try {
    const { dealId, dealValue, probability, weightedValue, forecastMonth, forecastCategory } = req.body;

    if (!dealId || !dealValue) {
      return res.status(400).json({ success: false, error: 'Missing dealId or dealValue' });
    }

    const updateQuery = `
      UPDATE deals
      SET deal_value = $1, win_probability = $2, weighted_forecast = $3, forecast_month = $4, updated_at = NOW()
      WHERE id = $5
      RETURNING id, weighted_forecast;
    `;

    await db.query(updateQuery, [dealValue, probability, weightedValue, forecastMonth, dealId]);

    res.status(200).json({
      success: true,
      dealId,
      dealValue,
      probability,
      weightedValue,
      forecastMonth,
      forecastCategory
    });

  } catch (error) {
    console.error('Error updating forecast:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. Update rep performance dashboard
router.post('/update-dashboard', async (req, res) => {
  try {
    const query = `
      SELECT
        sr.id, sr.name,
        COUNT(d.id) as total_deals,
        SUM(CASE WHEN d.outcome = 'won' THEN 1 ELSE 0 END) as closed_deals,
        ROUND(SUM(d.deal_value) FILTER (WHERE d.outcome = 'won')::numeric, 2) as total_revenue,
        ROUND(AVG(d.deal_value) FILTER (WHERE d.outcome = 'won')::numeric, 2) as avg_deal_size,
        ROUND(SUM(CASE WHEN d.outcome = 'won' THEN 1 ELSE 0 END)::numeric / COUNT(d.id) * 100, 2) as win_rate
      FROM sales_reps sr
      LEFT JOIN deals d ON sr.id = d.assigned_rep
      WHERE d.created_at > NOW() - INTERVAL '30 days'
      GROUP BY sr.id, sr.name
      ORDER BY total_revenue DESC;
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      period: 'current_month',
      reps: result.rows
    });

  } catch (error) {
    console.error('Error updating dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. Schedule lost deal re-engagement
router.post('/schedule-reeng', async (req, res) => {
  try {
    const { dealId, lostReason, dealValue, reEngagementSchedule, firstReEngagementDate } = req.body;

    if (!dealId || !lostReason) {
      return res.status(400).json({ success: false, error: 'Missing dealId or lostReason' });
    }

    const scheduled = [];

    for (const event of reEngagementSchedule || []) {
      const scheduleDate = new Date(firstReEngagementDate);
      scheduleDate.setDate(scheduleDate.getDate() + event.day);

      const insertQuery = `
        INSERT INTO lost_deal_reeng (deal_id, reeng_day, scheduled_date, message, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id;
      `;

      const result = await db.query(insertQuery, [
        dealId,
        event.day,
        scheduleDate.toISOString(),
        event.message
      ]);

      scheduled.push({ day: event.day, id: result.rows[0].id, date: scheduleDate.toISOString() });
    }

    res.status(200).json({
      success: true,
      dealId,
      lostReason,
      dealValue,
      reEngagementScheduled: scheduled.length,
      schedule: scheduled
    });

  } catch (error) {
    console.error('Error scheduling re-engagement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. Get sales pipeline summary
router.get('/pipeline-summary', async (req, res) => {
  try {
    const query = `
      SELECT
        stage,
        COUNT(*) as deal_count,
        ROUND(SUM(deal_value)::numeric, 2) as total_value,
        ROUND(AVG(deal_value)::numeric, 2) as avg_value,
        ROUND(AVG(win_probability) * 100, 2) as avg_probability,
        ROUND(SUM(deal_value * win_probability)::numeric, 2) as weighted_value
      FROM deals
      WHERE status NOT IN ('won', 'lost')
      GROUP BY stage
      ORDER BY CASE stage
        WHEN 'prospect' THEN 1
        WHEN 'quote' THEN 2
        WHEN 'negotiation' THEN 3
        WHEN 'closing' THEN 4
        ELSE 5
      END;
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      pipeline: result.rows,
      totalWeightedForecast: result.rows.reduce((sum, row) => sum + parseFloat(row.weighted_value), 0)
    });

  } catch (error) {
    console.error('Error fetching pipeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 12. Get win/loss analysis
router.get('/win-loss-analysis', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const query = `
      SELECT
        outcome,
        COUNT(*) as count,
        ROUND(SUM(closed_amount)::numeric, 2) as total_revenue,
        ROUND(AVG(closed_amount)::numeric, 2) as avg_value,
        ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM deals WHERE closed_date > NOW() - INTERVAL '${parseInt(days)} days') * 100, 2) as percentage
      FROM deals
      WHERE closed_date > NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY outcome;
    `;

    const result = await db.query(query);

    res.status(200).json({
      success: true,
      period: `${days}_days`,
      analysis: result.rows
    });

  } catch (error) {
    console.error('Error analyzing win/loss:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;