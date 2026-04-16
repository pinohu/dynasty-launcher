import { sql } from '@vercel/postgres';
import { OpenAI } from 'openai';
import Acumbamail from 'acumbamail-sdk';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const acumbamail = new Acumbamail(process.env.ACUMBAMAIL_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { clientId, action = 'all' } = req.body;

    if (action === 'renewal_reminders' || action === 'all') {
      const renewalClients = await sql`
        SELECT c.id, c.name, c.email, c.renewal_date, c.contract_value
        FROM clients c
        WHERE c.status = 'active' AND c.renewal_date IS NOT NULL
        AND c.last_contact < NOW() - INTERVAL '7 days'
        ORDER BY c.renewal_date ASC
      `;

      for (const client of renewalClients.rows) {
        const daysUntil = Math.ceil(
          (new Date(client.renewal_date) - new Date()) / (1000 * 60 * 60 * 24)
        );

        if ([7, 14, 30, 60].includes(daysUntil)) {
          const campaignMap = {
            60: 'renewal_reminder_60d',
            30: 'renewal_reminder_30d',
            14: 'renewal_reminder_14d',
            7: 'renewal_reminder_7d'
          };

          await acumbamail.sendCampaign({
            email: client.email,
            campaignId: campaignMap[daysUntil],
            customData: {
              clientName: client.name,
              renewalDate: client.renewal_date,
              contractValue: client.contract_value
            }
          });

          await sql`
            INSERT INTO client_interactions 
            (client_id, interaction_type, timestamp, details)
            VALUES (${client.id}, 'renewal_reminder', NOW(), ${`${daysUntil} day reminder sent`})
          `;

          await sql`
            UPDATE clients SET last_contact = NOW() WHERE id = ${client.id}
          `;
        }
      }
    }

    if (action === 'churn_risk' || action === 'all') {
      const client = clientId ? 
        (await sql`SELECT * FROM clients WHERE id = ${clientId}`).rows[0] :
        null;

      if (client) {
        const usage = await sql`
          SELECT COUNT(*) as service_count, AVG(service_rating) as avg_rating
          FROM services 
          WHERE client_id = ${client.id} AND completed_date > NOW() - INTERVAL '30 days'
        `;

        const riskAnalysis = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Analyze client churn risk (0-100 score) based on usage patterns.'
            },
            {
              role: 'user',
              content: `Client: ${client.name}, Services last 30d: ${usage.rows[0].service_count}, Avg Rating: ${usage.rows[0].avg_rating}, Contract Value: $${client.contract_value}`
            }
          ]
        });

        const riskScore = parseInt(riskAnalysis.choices[0].message.content);

        await sql`
          INSERT INTO client_risk_assessments 
          (client_id, risk_score, assessment_date, details)
          VALUES (${client.id}, ${riskScore}, NOW(), ${riskAnalysis.choices[0].message.content})
        `;

        if (riskScore > 70) {
          await acumbamail.sendCampaign({
            email: client.email,
            campaignId: 'retention_offer_high_risk'
          });
        }
      }
    }

    if (action === 'health_scores' || action === 'all') {
      const clients = clientId ?
        (await sql`SELECT id FROM clients WHERE id = ${clientId}`).rows :
        (await sql`SELECT id FROM clients WHERE status = 'active'`).rows;

      for (const client of clients) {
        const health = await sql`
          SELECT 
            AVG(service_rating) as avg_rating,
            COUNT(*) as service_count,
            SUM(CASE WHEN service_date > NOW() - INTERVAL '30 days' THEN cost ELSE 0 END) as recent_value,
            COUNT(DISTINCT DATE(service_date)) as active_days
          FROM services
          WHERE client_id = ${client.id} AND service_date > NOW() - INTERVAL '90 days'
        `;

        const row = health.rows[0];
        const score = (
          (row.avg_rating || 0) * 0.4 +
          (Math.min(row.service_count || 0, 10) * 10) * 0.3 +
          (Math.min(row.recent_value || 0, 5000) / 50) * 0.2 +
          (Math.min(row.active_days || 0, 30) * 3) * 0.1
        ) / 100;

        await sql`
          INSERT INTO client_health_scores 
          (client_id, score, calculated_at, metric_data)
          VALUES (${client.id}, ${score}, NOW(), ${JSON.stringify(row)})
          ON CONFLICT (client_id) DO UPDATE SET score = EXCLUDED.score
        `;
      }
    }

    if (action === 'milestones' || action === 'all') {
      const milestones = await sql`
        SELECT c.id, c.name, c.email, 
          EXTRACT(YEAR FROM AGE(NOW(), c.created_at)) as years_customer
        FROM clients c
        WHERE c.status = 'active'
        AND (
          EXTRACT(YEAR FROM AGE(NOW(), c.created_at))::int IN (1, 5, 10, 15, 20)
          AND EXTRACT(DOY FROM NOW()) = EXTRACT(DOY FROM c.created_at)
        )
      `;

      for (const milestone of milestones.rows) {
        const campaignId = {
          1: 'milestone_1year',
          5: 'milestone_5year',
          10: 'milestone_10year',
          15: 'milestone_15year',
          20: 'milestone_20year'
        }[milestone.years_customer];

        await acumbamail.sendCampaign({
          email: milestone.email,
          campaignId,
          customData: { yearsCustomer: milestone.years_customer }
        });

        await sql`
          INSERT INTO milestone_recognitions 
          (client_id, milestone_type, recognized_at)
          VALUES (${milestone.id}, ${`${milestone.years_customer}_year`}, NOW())
        `;
      }
    }

    if (action === 'monthly_reports' || action === 'all') {
      const reportClients = clientId ?
        (await sql`SELECT id, email, name FROM clients WHERE id = ${clientId}`).rows :
        (await sql`
          SELECT c.id, c.email, c.name FROM clients c 
          WHERE c.status = 'active' AND c.report_frequency = 'monthly'
          AND (c.last_report IS NULL OR c.last_report < NOW() - INTERVAL '25 days')
        `).rows;

      for (const client of reportClients) {
        const usage = await sql`
          SELECT 
            COUNT(*) as total_services,
            SUM(cost) as total_cost,
            AVG(service_rating) as avg_rating,
            COUNT(DISTINCT DATE(service_date)) as active_days,
            MAX(service_date) as last_service_date
          FROM services
          WHERE client_id = ${client.id} AND service_date > NOW() - INTERVAL '1 month'
        `;

        const row = usage.rows[0];

        await acumbamail.sendCampaign({
          email: client.email,
          campaignId: 'monthly_usage_report',
          customData: {
            totalServices: row.total_services,
            totalCost: row.total_cost,
            avgRating: row.avg_rating,
            activeDays: row.active_days,
            lastService: row.last_service_date
          }
        });

        await sql`
          UPDATE clients SET last_report = NOW() WHERE id = ${client.id}
        `;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Retention automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Retention automation error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat31_retention'
    });
  }
}
