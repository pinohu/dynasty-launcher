import { sql } from '@vercel/postgres';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { itemId, equipmentId, action = 'all' } = req.body;

    if (action === 'monitor_stock' || action === 'all') {
      const items = itemId ?
        (await sql`SELECT id, item_name, current_stock, reorder_level FROM inventory_items WHERE id = ${itemId}`).rows :
        (await sql`
          SELECT id, item_name, current_stock, reorder_level, supplier_id 
          FROM inventory_items WHERE current_stock <= reorder_level ORDER BY current_stock ASC LIMIT 100
        `).rows;

      for (const item of items) {
        const alert = await sql`
          SELECT id FROM reorder_alerts 
          WHERE item_id = ${item.id} 
          AND triggered_at > NOW() - INTERVAL '24 hours'
        `;

        if (alert.rows.length === 0) {
          await sql`
            INSERT INTO reorder_alerts 
            (item_id, alert_type, triggered_at, current_level, threshold)
            VALUES (${item.id}, 'low_stock', NOW(), ${item.current_stock}, ${item.reorder_level})
          `;

          const supplier = await sql`
            SELECT name, email FROM vendors WHERE id = ${item.supplier_id}
          `;

          if (supplier.rows.length > 0) {
            console.log(`Stock alert for ${item.item_name}: ${item.current_stock} units (threshold: ${item.reorder_level})`);
          }
        }
      }
    }

    if (action === 'maintenance_schedule' || action === 'all') {
      const equipment = equipmentId ?
        (await sql`
          SELECT id, equipment_name, last_maintenance, maintenance_interval_days 
          FROM equipment WHERE id = ${equipmentId}
        `).rows :
        (await sql`
          SELECT id, equipment_name, last_maintenance, maintenance_interval_days 
          FROM equipment 
          WHERE status = 'active'
          AND (
            last_maintenance IS NULL 
            OR last_maintenance < NOW() - INTERVAL '1' || maintenance_interval_days || ' days'
          )
          ORDER BY last_maintenance ASC NULLS FIRST
          LIMIT 100
        `).rows;

      for (const equip of equipment) {
        const existing = await sql`
          SELECT id FROM maintenance_schedules 
          WHERE equipment_id = ${equip.id}
          AND scheduled_date > NOW()
          AND status IN ('scheduled', 'in_progress')
        `;

        if (existing.rows.length === 0) {
          const scheduledDate = new Date();
          scheduledDate.setDate(scheduledDate.getDate() + 3);

          await sql`
            INSERT INTO maintenance_schedules 
            (equipment_id, scheduled_date, maintenance_type, status, created_at)
            VALUES (${equip.id}, ${scheduledDate.toISOString()}, 'preventive', 'scheduled', NOW())
          `;
        }
      }
    }

    if (action === 'depreciation_calc' || action === 'all') {
      const assets = await sql`
        SELECT 
          id, asset_name, purchase_date, asset_cost, 
          depreciation_method, useful_life_years
        FROM fixed_assets 
        WHERE status = 'active' AND depreciation_method IS NOT NULL
        LIMIT 100
      `;

      for (const asset of assets.rows) {
        const lastCalc = await sql`
          SELECT MAX(calculation_date) as last_calc FROM asset_depreciation 
          WHERE asset_id = ${asset.id}
        `;

        const lastCalcDate = lastCalc.rows[0]?.last_calc;
        if (!lastCalcDate || new Date(lastCalcDate) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
          let depreciationAmount = 0;
          let bookValue = asset.asset_cost;

          if (asset.depreciation_method === 'straight_line') {
            depreciationAmount = asset.asset_cost / (asset.useful_life_years * 12);
            const monthsOld = Math.floor(
              (new Date() - new Date(asset.purchase_date)) / (1000 * 60 * 60 * 24 * 30)
            );
            bookValue = asset.asset_cost - (depreciationAmount * monthsOld);
          } else if (asset.depreciation_method === 'double_declining') {
            const monthsOld = Math.floor(
              (new Date() - new Date(asset.purchase_date)) / (1000 * 60 * 60 * 24 * 30)
            );
            const rate = (2 / asset.useful_life_years) / 12;
            let value = asset.asset_cost;
            for (let i = 0; i < monthsOld; i++) {
              depreciationAmount = value * rate;
              value -= depreciationAmount;
            }
            bookValue = value;
          }

          await sql`
            INSERT INTO asset_depreciation 
            (asset_id, month, depreciation_amount, book_value, calculation_date)
            VALUES (
              ${asset.id}, 
              DATE_TRUNC('month', NOW()), 
              ${depreciationAmount}, 
              ${Math.max(0, bookValue)}, 
              NOW()
            )
          `;
        }
      }
    }

    if (action === 'license_renewal' || action === 'all') {
      const licenses = await sql`
        SELECT id, license_name, expiry_date, vendor_id 
        FROM subscriptions 
        WHERE subscription_type = 'license' 
        AND expiry_date IS NOT NULL
        AND expiry_date <= NOW() + INTERVAL '30 days'
        AND status = 'active'
        ORDER BY expiry_date ASC
        LIMIT 100
      `;

      for (const license of licenses.rows) {
        const existing = await sql`
          SELECT id FROM license_renewals 
          WHERE subscription_id = ${license.id}
          AND renewal_date > NOW() - INTERVAL '7 days'
        `;

        if (existing.rows.length === 0) {
          const daysUntil = Math.ceil(
            (new Date(license.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
          );

          await sql`
            INSERT INTO license_renewals 
            (subscription_id, vendor_id, days_until_expiry, notified_at)
            VALUES (${license.id}, ${license.vendor_id}, ${daysUntil}, NOW())
          `;
        }
      }
    }

    if (action === 'checkout_return' || action === 'all') {
      const overdue = await sql`
        SELECT ec.id, ec.equipment_id, ec.assigned_to, ec.checkout_date, e.equipment_name
        FROM equipment_checkouts ec
        JOIN equipment e ON ec.equipment_id = e.id
        WHERE ec.check_in_date IS NULL 
        AND ec.checkout_date < NOW() - INTERVAL '7 days'
        ORDER BY ec.checkout_date ASC
        LIMIT 100
      `;

      for (const checkout of overdue.rows) {
        const reminder = await sql`
          SELECT id FROM checkout_reminders 
          WHERE checkout_id = ${checkout.id}
          AND created_at > NOW() - INTERVAL '24 hours'
        `;

        if (reminder.rows.length === 0) {
          const daysOverdue = Math.floor(
            (new Date() - new Date(checkout.checkout_date)) / (1000 * 60 * 60 * 24)
          );

          await sql`
            INSERT INTO checkout_reminders 
            (checkout_id, days_overdue, reminder_type, created_at)
            VALUES (${checkout.id}, ${daysOverdue}, 'overdue_return', NOW())
          `;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Inventory and equipment automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Inventory automation error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat34_inventory'
    });
  }
}
