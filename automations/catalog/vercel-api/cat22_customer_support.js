import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();

  try {
    switch (action) {
      case 'ticket-creation':
        return createAndCategorizeTicket(payload);
      case 'priority-assignment':
        return assignPriority(payload);
      case 'sla-breach-alert':
        return checkSLABreach(payload);
      case 'escalation-workflow':
        return escalateTicket(payload);
      case 'kb-suggestion':
        return suggestKBArticles(payload);
      case 'csat-survey':
        return sendCSATSurvey(payload);
      case 'frt-tracker':
        return trackFirstResponseTime(payload);
      case 'ticket-deduplication':
        return deduplicateTickets(payload);
      case 'metrics-reporter':
        return generateMetricsReport(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Support error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function createAndCategorizeTicket(payload) {
  const { customerId, email, subject, description, channel, businessId } = payload;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Categorize this support issue into one category: "${subject}" - "${description}". Valid categories: Technical, Billing, Feature Request, Bug Report, Account, Other. Return: {"category": "...", "urgency": "low|medium|high"}`
      }
    ]
  });

  const categorization = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');

  const db = await import('@vercel/postgres').then(m => m.sql);

  const ticket = await db`
    INSERT INTO support_tickets (business_id, customer_id, email, subject, description, channel, category, urgency, status)
    VALUES (${businessId}, ${customerId}, ${email}, ${subject}, ${description}, ${channel}, ${categorization.category}, ${categorization.urgency}, 'open')
    RETURNING id, created_at
  `;

  return NextResponse.json({
    success: true,
    ticketId: ticket.rows[0].id,
    category: categorization.category,
    urgency: categorization.urgency,
    createdAt: ticket.rows[0].created_at
  });
}

async function assignPriority(payload) {
  const { ticketId, issue, customerTier, urgency, businessId } = payload;

  let priority = 'medium';
  if (urgency === 'high' || customerTier === 'premium') priority = 'high';
  else if (urgency === 'low' && customerTier === 'basic') priority = 'low';

  const db = await import('@vercel/postgres').then(m => m.sql);

  await db`
    UPDATE support_tickets
    SET priority = ${priority}
    WHERE id = ${ticketId} AND business_id = ${businessId}
  `;

  return NextResponse.json({
    success: true,
    ticketId,
    priority,
    assignmentTime: new Date().toISOString()
  });
}

async function checkSLABreach(payload) {
  const { ticketId, priority, createdAt, businessId } = payload;

  const slaLimits = {
    high: 1 * 60 * 60 * 1000,
    medium: 4 * 60 * 60 * 1000,
    low: 8 * 60 * 60 * 1000
  };

  const elapsedTime = Date.now() - new Date(createdAt).getTime();
  const slaLimit = slaLimits[priority] || slaLimits.medium;
  const breached = elapsedTime > slaLimit;

  const db = await import('@vercel/postgres').then(m => m.sql);

  if (breached) {
    await db`
      INSERT INTO sla_breaches (business_id, ticket_id, priority, elapsed_time, sla_limit)
      VALUES (${businessId}, ${ticketId}, ${priority}, ${elapsedTime}, ${slaLimit})
    `;

    await fetch('https://api.acumbamail.com/v1/email/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: `SLA Breach Alert - Ticket ${ticketId}`,
        template: 'sla_breach_alert',
        variables: { ticketId, priority }
      })
    });
  }

  return NextResponse.json({
    success: true,
    ticketId,
    breached,
    elapsedHours: (elapsedTime / (60 * 60 * 1000)).toFixed(1)
  });
}

async function escalateTicket(payload) {
  const { ticketId, currentTier, reason, businessId } = payload;

  const nextTier = Math.min(currentTier + 1, 3);

  const db = await import('@vercel/postgres').then(m => m.sql);

  await db`
    UPDATE support_tickets
    SET tier = ${nextTier}, escalation_reason = ${reason}
    WHERE id = ${ticketId} AND business_id = ${businessId}
  `;

  const escalationTemplates = {
    1: 'escalation_tier2',
    2: 'escalation_tier3',
    3: 'escalation_management'
  };

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subject: `Escalation - Ticket ${ticketId} to Tier ${nextTier}`,
      template: escalationTemplates[nextTier],
      variables: { ticketId, reason }
    })
  });

  return NextResponse.json({
    success: true,
    ticketId,
    escalatedToTier: nextTier,
    reason
  });
}

async function suggestKBArticles(payload) {
  const { ticketId, issue, businessId } = payload;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Suggest 3 knowledge base article titles for this support issue: "${issue}". Return JSON: {"articles": ["title1", "title2", "title3"]}`
      }
    ]
  });

  const suggestions = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{"articles": []}');

  return NextResponse.json({
    success: true,
    ticketId,
    suggestedArticles: suggestions.articles
  });
}

async function sendCSATSurvey(payload) {
  const { ticketId, customerId, email, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const survey = await db`
    INSERT INTO csat_surveys (business_id, ticket_id, customer_id, email, status, sent_at)
    VALUES (${businessId}, ${ticketId}, ${customerId}, ${email}, 'sent', NOW())
    RETURNING id
  `;

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: email,
      subject: 'How did we do? Rate your support experience',
      template: 'csat_survey',
      variables: { ticketId, surveyLink: `https://survey.deputy.com/csat/${survey.rows[0].id}` }
    })
  });

  return NextResponse.json({
    success: true,
    surveyId: survey.rows[0].id,
    ticketId
  });
}

async function trackFirstResponseTime(payload) {
  const { ticketId, createdAt, firstResponseAt, businessId } = payload;

  const responseTime = new Date(firstResponseAt).getTime() - new Date(createdAt).getTime();
  const responseMinutes = responseTime / (60 * 1000);

  const db = await import('@vercel/postgres').then(m => m.sql);

  await db`
    INSERT INTO frt_metrics (business_id, ticket_id, response_time_ms, response_minutes)
    VALUES (${businessId}, ${ticketId}, ${responseTime}, ${responseMinutes})
  `;

  return NextResponse.json({
    success: true,
    ticketId,
    responseTimeMinutes: responseMinutes.toFixed(2),
    withinSLA: responseMinutes <= 60
  });
}

async function deduplicateTickets(payload) {
  const { ticketId, subject, customerId, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const duplicates = await db`
    SELECT id FROM support_tickets
    WHERE business_id = ${businessId}
      AND customer_id = ${customerId}
      AND subject LIKE ${`%${subject}%`}
      AND id != ${ticketId}
      AND status NOT IN ('closed', 'merged')
  `;

  if (duplicates.rows.length > 0) {
    const mergedTickets = duplicates.rows.map(r => r.id);

    await db`
      UPDATE support_tickets
      SET status = 'merged', merged_into = ${ticketId}
      WHERE id = ANY(${mergedTickets})
    `;

    return NextResponse.json({
      success: true,
      ticketId,
      mergedCount: mergedTickets.length,
      mergedTickets
    });
  }

  return NextResponse.json({
    success: true,
    ticketId,
    mergedCount: 0,
    message: 'No duplicates found'
  });
}

async function generateMetricsReport(payload) {
  const { period, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const metrics = await db`
    SELECT 
      COUNT(*) as total_tickets,
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) as avg_resolution_hours,
      COUNT(CASE WHEN priority = 'high' THEN 1 END) as high_priority_count,
      COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_tickets
    FROM support_tickets
    WHERE business_id = ${businessId}
      AND created_at >= NOW() - INTERVAL '${period}'
  `;

  const csat = await db`
    SELECT AVG(rating) as avg_csat FROM csat_surveys
    WHERE business_id = ${businessId}
      AND created_at >= NOW() - INTERVAL '${period}'
  `;

  const row = metrics.rows[0];

  return NextResponse.json({
    success: true,
    period,
    totalTickets: row.total_tickets,
    avgResolutionHours: parseFloat(row.avg_resolution_hours).toFixed(1),
    closureRate: ((row.closed_tickets / row.total_tickets) * 100).toFixed(1),
    avgCSAT: parseFloat(csat.rows[0]?.avg_csat || 0).toFixed(1)
  });
}
