import { sql } from '@vercel/postgres';
import { OpenAI } from 'openai';
import Stripe from 'stripe';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { vendorId, action = 'all' } = req.body;

    if (action === 'process_invoices' || action === 'all') {
      const invoices = vendorId ?
        (await sql`
          SELECT id, vendor_id, amount, receipt_url FROM vendor_invoices 
          WHERE vendor_id = ${vendorId} AND status = 'received'
        `).rows :
        (await sql`
          SELECT id, vendor_id, amount, receipt_url FROM vendor_invoices 
          WHERE status = 'received' AND processed = false 
          ORDER BY received_date ASC LIMIT 100
        `).rows;

      for (const invoice of invoices) {
        try {
          const extracted = await openai.chat.completions.create({
            model: 'gpt-4-vision',
            messages: [
              {
                role: 'system',
                content: 'Extract invoice details including vendor name, amount, date, description, and suggested project match'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Process invoice for amount: ${invoice.amount}`
                  },
                  ...(invoice.receipt_url ? [{
                    type: 'image_url',
                    image_url: { url: invoice.receipt_url }
                  }] : [])
                ]
              }
            ]
          });

          const extractedData = JSON.parse(extracted.choices[0].message.content);

          const projects = await sql`
            SELECT id, name FROM projects 
            WHERE status = 'active' 
            LIMIT 5
          `;

          let matchedProjectId = null;
          if (projects.rows.length > 0 && extractedData.description) {
            const projectMatch = await openai.chat.completions.create({
              model: 'gpt-4',
              messages: [
                {
                  role: 'system',
                  content: 'Match invoice description to most likely project from list'
                },
                {
                  role: 'user',
                  content: `Description: "${extractedData.description}", Projects: ${JSON.stringify(projects.rows.map(p => p.name))}`
                }
              ]
            });
            const matched = projects.rows.find(p => 
              projectMatch.choices[0].message.content.includes(p.name)
            );
            matchedProjectId = matched?.id;
          }

          await sql`
            UPDATE vendor_invoices 
            SET 
              processed = true,
              processed_at = NOW(),
              matched_project = ${matchedProjectId},
              extracted_data = ${JSON.stringify(extractedData)}
            WHERE id = ${invoice.id}
          `;
        } catch (e) {
          console.error('Invoice processing error:', e);
          await sql`
            UPDATE vendor_invoices 
            SET status = 'processing_failed' 
            WHERE id = ${invoice.id}
          `;
        }
      }
    }

    if (action === 'contract_expiry' || action === 'all') {
      const vendors = vendorId ?
        (await sql`SELECT id, vendor_name, email FROM vendors WHERE id = ${vendorId}`).rows :
        (await sql`
          SELECT id, vendor_name, email FROM vendors 
          WHERE status = 'active' AND contract_end_date IS NOT NULL
          AND contract_end_date <= NOW() + INTERVAL '30 days'
          ORDER BY contract_end_date ASC
        `).rows;

      for (const vendor of vendors) {
        const daysUntil = await sql`
          SELECT EXTRACT(DAY FROM contract_end_date - NOW()) as days_until
          FROM vendors WHERE id = ${vendor.id}
        `;

        const days = Math.ceil(daysUntil.rows[0].days_until);

        await sql`
          INSERT INTO vendor_notifications 
          (vendor_id, notification_type, expires_at)
          VALUES (${vendor.id}, 'contract_expiry_notice', NOW() + INTERVAL '7 days')
        `;
      }
    }

    if (action === 'performance_scoring' || action === 'all') {
      const vendors = vendorId ?
        (await sql`SELECT id FROM vendors WHERE id = ${vendorId}`).rows :
        (await sql`SELECT id FROM vendors WHERE status = 'active'`).rows;

      for (const vendor of vendors) {
        const performance = await sql`
          SELECT 
            COUNT(*) as total_invoices,
            COUNT(CASE WHEN on_time = true THEN 1 END) as on_time_count,
            AVG(rating) as avg_rating,
            SUM(CASE WHEN quality_issues = false THEN 1 ELSE 0 END) as quality_count
          FROM vendor_invoices
          WHERE vendor_id = ${vendor.id} AND invoice_date > NOW() - INTERVAL '90 days'
        `;

        const perf = performance.rows[0];
        const onTimePercent = perf.total_invoices > 0 ? 
          (perf.on_time_count / perf.total_invoices) * 100 : 0;
        const qualityPercent = perf.total_invoices > 0 ?
          (perf.quality_count / perf.total_invoices) * 100 : 0;

        const overallScore = (
          (perf.avg_rating || 0) * 0.4 +
          onTimePercent * 0.4 +
          qualityPercent * 0.2
        ) / 100;

        await sql`
          INSERT INTO vendor_performance_scores 
          (vendor_id, score, calculated_at, on_time_percent, quality_percent)
          VALUES (${vendor.id}, ${overallScore}, NOW(), ${onTimePercent}, ${qualityPercent})
          ON CONFLICT (vendor_id, DATE(calculated_at)) 
          DO UPDATE SET score = EXCLUDED.score
        `;
      }
    }

    if (action === 'purchase_orders' || action === 'all') {
      const poQuery = vendorId ?
        (await sql`
          SELECT id, vendor_id, amount FROM purchase_orders 
          WHERE vendor_id = ${vendorId} AND status = 'draft'
        `).rows :
        (await sql`
          SELECT id, vendor_id, amount FROM purchase_orders 
          WHERE status = 'draft' ORDER BY created_at ASC LIMIT 50
        `).rows;

      for (const po of poQuery) {
        await sql`
          INSERT INTO purchase_order_logs 
          (po_id, vendor_id, action, timestamp)
          VALUES (${po.id}, ${po.vendor_id}, 'issued', NOW())
        `;

        await sql`
          UPDATE purchase_orders SET status = 'issued', issued_at = NOW()
          WHERE id = ${po.id}
        `;
      }
    }

    if (action === 'payment_scheduling' || action === 'all') {
      const contracts = vendorId ?
        (await sql`
          SELECT id, vendor_id, payment_terms, contract_value 
          FROM vendor_contracts WHERE vendor_id = ${vendorId} AND status = 'active'
        `).rows :
        (await sql`
          SELECT id, vendor_id, payment_terms, contract_value 
          FROM vendor_contracts WHERE status = 'active' LIMIT 50
        `).rows;

      for (const contract of contracts) {
        const termsDays = parseInt(contract.payment_terms.match(/\d+/)?.[0] || 30);
        const paymentAmount = contract.contract_value / 12;

        const nextPayments = [];
        for (let i = 0; i < 12; i++) {
          const paymentDate = new Date();
          paymentDate.setDate(paymentDate.getDate() + (i * 30));

          nextPayments.push({
            vendorId: contract.vendor_id,
            contractId: contract.id,
            scheduledDate: paymentDate,
            amount: paymentAmount,
            terms: contract.payment_terms
          });
        }

        for (const payment of nextPayments) {
          await sql`
            INSERT INTO scheduled_payments 
            (vendor_id, contract_id, scheduled_date, amount, payment_terms, status)
            VALUES (
              ${payment.vendorId}, 
              ${payment.contractId}, 
              ${payment.scheduledDate.toISOString()}, 
              ${payment.amount}, 
              ${payment.terms}, 
              'scheduled'
            )
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Vendor management automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Vendor management error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat33_vendor_management'
    });
  }
}
