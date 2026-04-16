import { sql } from '@vercel/postgres';
import { OpenAI } from 'openai';
import Acumbamail from 'acumbamail-sdk';
import Stripe from 'stripe';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const acumbamail = new Acumbamail(process.env.ACUMBAMAIL_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { clientId, action = 'all' } = req.body;

    if (action === 'exit_survey' || action === 'all') {
      const clients = clientId ?
        (await sql`SELECT id, name, email FROM clients WHERE id = ${clientId}`).rows :
        (await sql`
          SELECT id, name, email FROM clients 
          WHERE status = 'pending_cancellation' AND cancellation_date IS NOT NULL
        `).rows;

      for (const client of clients) {
        await acumbamail.sendCampaign({
          email: client.email,
          campaignId: 'exit_survey',
          customData: { clientName: client.name }
        });

        await sql`
          INSERT INTO client_interactions 
          (client_id, interaction_type, timestamp)
          VALUES (${client.id}, 'exit_survey_sent', NOW())
        `;
      }
    }

    if (action === 'retention_offer' || action === 'all') {
      const clients = clientId ?
        (await sql`SELECT id, name, email, contract_value FROM clients WHERE id = ${clientId}`).rows :
        (await sql`
          SELECT id, name, email, contract_value FROM clients 
          WHERE status = 'pending_cancellation' LIMIT 50
        `).rows;

      for (const client of clients) {
        const riskData = await sql`
          SELECT risk_score FROM client_risk_assessments 
          WHERE client_id = ${client.id} 
          ORDER BY assessment_date DESC LIMIT 1
        `;

        const riskScore = riskData.rows[0]?.risk_score || 50;

        const offer = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Generate a personalized retention offer with discount percentage (5-25%) based on client value and risk.'
            },
            {
              role: 'user',
              content: `Client: ${client.name}, Contract Value: $${client.contract_value}, Churn Risk: ${riskScore}/100`
            }
          ]
        });

        const offerText = offer.choices[0].message.content;
        const discountMatch = offerText.match(/(\d+)%/);
        const discount = discountMatch ? parseInt(discountMatch[1]) : 10;

        await sql`
          INSERT INTO retention_offers 
          (client_id, offer_text, discount_percentage, expires_at)
          VALUES (${client.id}, ${offerText}, ${discount}, NOW() + INTERVAL '7 days')
        `;

        await acumbamail.sendCampaign({
          email: client.email,
          campaignId: 'last_minute_offer',
          customData: { discount, offerText }
        });
      }
    }

    if (action === 'account_deactivation' || action === 'all') {
      const clients = clientId ?
        (await sql`SELECT id, email FROM clients WHERE id = ${clientId} AND status = 'pending_cancellation'`).rows :
        (await sql`
          SELECT id, email FROM clients 
          WHERE status = 'pending_cancellation' 
          AND cancellation_date <= NOW()
          LIMIT 50
        `).rows;

      for (const client of clients) {
        await sql`
          INSERT INTO client_churn_log 
          (client_id, churn_date, reason, data_preserved)
          VALUES (${client.id}, NOW(), 'manual_cancellation', true)
        `;

        const subscriptions = await sql`
          SELECT id, stripe_subscription_id FROM subscriptions 
          WHERE client_id = ${client.id} AND status = 'active'
        `;

        for (const sub of subscriptions.rows) {
          if (sub.stripe_subscription_id) {
            try {
              await stripe.subscriptions.cancel(sub.stripe_subscription_id);
            } catch (e) {
              console.error('Stripe cancellation error:', e);
            }
          }

          await sql`
            UPDATE subscriptions SET status = 'canceled', canceled_at = NOW()
            WHERE id = ${sub.id}
          `;
        }

        await sql`
          UPDATE clients SET status = 'inactive', deactivated_at = NOW()
          WHERE id = ${client.id}
        `;
      }
    }

    if (action === 'final_invoice_export' || action === 'all') {
      const clients = clientId ?
        (await sql`SELECT id, email, name FROM clients WHERE id = ${clientId}`).rows :
        (await sql`
          SELECT c.id, c.email, c.name FROM clients c
          WHERE c.status = 'inactive' AND c.deactivated_at > NOW() - INTERVAL '2 days'
          LIMIT 50
        `).rows;

      for (const client of clients) {
        const invoice = await sql`
          SELECT id, amount, due_date, items FROM invoices
          WHERE client_id = ${client.id}
          ORDER BY created_at DESC LIMIT 1
        `;

        const clientData = await sql`
          SELECT 
            c.*, 
            array_agg(json_build_object('id', s.id, 'type', s.type, 'value', s.cost)) as services
          FROM clients c
          LEFT JOIN services s ON c.id = s.client_id
          WHERE c.id = ${client.id}
          GROUP BY c.id
        `;

        const exportData = {
          client: clientData.rows[0],
          finalInvoice: invoice.rows[0],
          exportDate: new Date().toISOString()
        };

        await sql`
          INSERT INTO client_data_exports 
          (client_id, data, export_date, include_services)
          VALUES (${client.id}, ${JSON.stringify(exportData)}, NOW(), true)
        `;

        await acumbamail.sendCampaign({
          email: client.email,
          campaignId: 'final_invoice_export',
          customData: exportData
        });
      }
    }

    if (action === 'post_churn_feedback' || action === 'all') {
      const clients = clientId ?
        (await sql`SELECT id, email, name FROM clients WHERE id = ${clientId}`).rows :
        (await sql`
          SELECT c.id, c.email, c.name FROM clients c
          WHERE c.status = 'inactive'
          AND c.deactivated_at > NOW() - INTERVAL '32 days'
          AND c.deactivated_at < NOW() - INTERVAL '28 days'
          AND NOT EXISTS (
            SELECT 1 FROM client_interactions 
            WHERE client_id = c.id AND interaction_type = 'feedback_request'
          )
          LIMIT 50
        `).rows;

      for (const client of clients) {
        await acumbamail.sendCampaign({
          email: client.email,
          campaignId: 'feedback_request_30day',
          customData: { clientName: client.name }
        });

        await sql`
          INSERT INTO client_interactions 
          (client_id, interaction_type, timestamp)
          VALUES (${client.id}, 'feedback_request', NOW())
        `;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Offboarding automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Offboarding automation error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat32_offboarding'
    });
  }
}
