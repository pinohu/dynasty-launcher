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
      case 'monitor_usage':
        return await monitorUsageLimits(req, res);
      case 'recommend_services':
        return await recommendComplementaryServices(req, res);
      case 'create_upgrade':
        return await createUpgradePackage(req, res);
      case 'recover_abandonment':
        return await recoverAbandonedCartEstimate(req, res);
      case 'anniversary_offer':
        return await generateAnniversaryOffer(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function monitorUsageLimits(req, res) {
  const client = await pool.connect();
  try {
    const { warningThreshold = 0.8 } = req.body;

    // Get active subscriptions with usage data
    const result = await client.query(
      `SELECT c.id, c.name, c.email, s.service_type, s.usage_limit,
       (SELECT COUNT(*) FROM jobs WHERE client_id = c.id AND created_at > NOW() - interval '30 days') as current_usage
       FROM clients c
       JOIN subscriptions s ON c.id = s.client_id
       WHERE s.status = 'active'`
    );

    const customers = result.rows;
    const upsellCandidates = [];

    for (const customer of customers) {
      const usagePercent = customer.current_usage / customer.usage_limit;

      if (usagePercent >= warningThreshold) {
        upsellCandidates.push({
          customerId: customer.id,
          customerName: customer.name,
          email: customer.email,
          serviceType: customer.service_type,
          usagePercent: (usagePercent * 100).toFixed(0),
          currentUsage: customer.current_usage,
          limit: customer.usage_limit
        });

        // Send upsell email
        try {
          await resend.emails.send({
            from: 'upsell@deputy.local',
            to: customer.email,
            subject: `You're Almost There! Upgrade to Avoid Service Interruption`,
            html: `
              <h2>Usage Approaching Limit</h2>
              <p>Hi ${customer.name},</p>
              <p>You've used ${(usagePercent * 100).toFixed(0)}% of your monthly ${customer.service_type} allocation.</p>
              <p><strong>Current Usage:</strong> ${customer.current_usage} of ${customer.usage_limit}</p>
              <p>Upgrade to our premium plan to get unlimited usage and additional features!</p>
              <p><a href="${process.env.DOMAIN}/upgrade?service=${customer.service_type}">View Upgrade Options</a></p>
            `
          });
        } catch (emailError) {
          console.error('Email send failed:', emailError);
        }
      }
    }

    res.status(200).json({
      success: true,
      upsellCandidates: upsellCandidates.length,
      candidates: upsellCandidates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function recommendComplementaryServices(req, res) {
  const client = await pool.connect();
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId required' });
    }

    // Get customer's current services
    const currentResult = await client.query(
      `SELECT DISTINCT service_type FROM jobs WHERE client_id = $1`,
      [customerId]
    );

    const currentServices = currentResult.rows.map(r => r.service_type);

    // Map complementary services
    const serviceComplements = {
      'plumbing': ['water_heater_maintenance', 'pipe_repair', 'drain_cleaning'],
      'electrical': ['panel_upgrade', 'wiring_inspection', 'outlet_installation'],
      'hvac': ['duct_cleaning', 'maintenance_plan', 'thermostat_upgrade'],
      'roofing': ['gutter_cleaning', 'inspections', 'maintenance'],
      'cleaning': ['deep_cleaning', 'carpet_cleaning', 'window_cleaning'],
      'landscaping': ['lawn_maintenance', 'tree_trimming', 'mulching']
    };

    let recommendations = [];
    for (const service of currentServices) {
      if (serviceComplements[service]) {
        recommendations = [...recommendations, ...serviceComplements[service]];
      }
    }

    // Remove duplicates and services they already have
    recommendations = [...new Set(recommendations)].filter(r => !currentServices.includes(r));

    // Get customer info for email
    const customerResult = await client.query(
      `SELECT name, email FROM clients WHERE id = $1`,
      [customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = customerResult.rows[0];

    // Create personalized recommendation
    const recommendationText = recommendations.slice(0, 3)
      .map(r => r.replace(/_/g, ' ').toUpperCase())
      .join(', ');

    try {
      await resend.emails.send({
        from: 'recommendations@deputy.local',
        to: customer.email,
        subject: 'Services You Might Need - Special Offer Inside',
        html: `
          <h2>Recommended Services for You</h2>
          <p>Hi ${customer.name},</p>
          <p>Based on your service history, we think you'd benefit from:</p>
          <p><strong>${recommendationText}</strong></p>
          <p>Get 15% off your first appointment with these services!</p>
          <p><a href="${process.env.DOMAIN}/services/recommendations">View Details</a></p>
        `
      });
    } catch (emailError) {
      console.error('Email send failed:', emailError);
    }

    res.status(200).json({
      success: true,
      customerId,
      currentServices,
      recommendations: recommendations.slice(0, 3),
      emailSent: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function createUpgradePackage(req, res) {
  const client = await pool.connect();
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'subscriptionId required' });
    }

    // Get subscription details
    const subResult = await client.query(
      `SELECT s.*, c.name, c.email FROM subscriptions s 
       JOIN clients c ON s.client_id = c.id 
       WHERE s.id = $1`,
      [subscriptionId]
    );

    if (subResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = subResult.rows[0];
    const renewalDate = new Date(subscription.renewal_date);
    const daysSinceStart = Math.floor((Date.now() - new Date(subscription.start_date)) / (1000 * 60 * 60 * 24));

    // Create upgrade options
    const upgrades = [
      {
        tier: 'Plus',
        description: 'Everything in your current plan, plus priority support',
        priceIncrease: 50,
        benefits: ['Priority support', 'Advanced analytics', 'Dedicated account manager']
      },
      {
        tier: 'Premium',
        description: 'Full-featured plan with custom solutions',
        priceIncrease: 150,
        benefits: ['24/7 Premium support', 'Custom solutions', 'API access', 'White-label options']
      }
    ];

    // Apply renewal discount if multi-year commitment
    const discountPercent = daysSinceStart > 365 ? 20 : 10;

    try {
      await resend.emails.send({
        from: 'renewals@deputy.local',
        to: subscription.email,
        subject: `Special Renewal Offer - ${discountPercent}% Off Upgrade!`,
        html: `
          <h2>Your Renewal is Coming Up!</h2>
          <p>Hi ${subscription.name},</p>
          <p>Your subscription renews on ${renewalDate.toLocaleDateString()}. Here's what we recommend:</p>
          <h3>Upgrade Offer - ${discountPercent}% Discount</h3>
          ${upgrades.map(u => `
            <div>
              <strong>${u.tier}:</strong> ${u.description}
              <p>Upgrade price: $${((subscription.price + u.priceIncrease) * (1 - discountPercent / 100)).toFixed(2)}/month</p>
              <ul>
                ${u.benefits.map(b => `<li>${b}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
          <p><a href="${process.env.DOMAIN}/upgrade?subscription=${subscriptionId}">View Upgrade Options</a></p>
        `
      });
    } catch (emailError) {
      console.error('Email send failed:', emailError);
    }

    res.status(201).json({
      success: true,
      subscriptionId,
      upgrades,
      discount: discountPercent,
      renewalDate: renewalDate.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function recoverAbandonedCartEstimate(req, res) {
  const client = await pool.connect();
  try {
    const { hoursAgo = 24 } = req.body;

    // Find abandoned estimates
    const estimateResult = await client.query(
      `SELECT e.id, e.client_id, e.total_amount, c.name, c.email, e.service_details,
       EXTRACT(HOUR FROM (NOW() - e.created_at)) as hours_since
       FROM estimates e
       JOIN clients c ON e.client_id = c.id
       WHERE e.status = 'pending' 
       AND e.created_at > NOW() - interval '${hoursAgo} hours'
       AND e.created_at < NOW() - interval '1 hour'`
    );

    const estimates = estimateResult.rows;
    const recovered = [];

    for (const estimate of estimates) {
      // Apply discount to abandoned estimate
      const discountPercent = 10;
      const newTotal = estimate.total_amount * (1 - discountPercent / 100);

      try {
        await resend.emails.send({
          from: 'recovery@deputy.local',
          to: estimate.email,
          subject: `${discountPercent}% Off Your Estimate - Limited Time!`,
          html: `
            <h2>Complete Your Booking</h2>
            <p>Hi ${estimate.name},</p>
            <p>We noticed you left an estimate unfinished.</p>
            <p><strong>Original Estimate:</strong> $${estimate.total_amount.toFixed(2)}</p>
            <p><strong>Your Special Price (${discountPercent}% off):</strong> $${newTotal.toFixed(2)}</p>
            <p><strong>Services:</strong> ${estimate.service_details}</p>
            <p>This discount expires in 24 hours!</p>
            <p><a href="${process.env.DOMAIN}/complete-estimate?id=${estimate.id}&discount=${discountPercent}">Complete Your Booking</a></p>
          `
        });

        recovered.push({
          estimateId: estimate.id,
          clientId: estimate.client_id,
          originalAmount: estimate.total_amount,
          discountedAmount: newTotal,
          discount: discountPercent
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      recoveredCount: recovered.length,
      recovered,
      totalRecoverableValue: recovered.reduce((sum, r) => sum + r.originalAmount, 0).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function generateAnniversaryOffer(req, res) {
  const client = await pool.connect();
  try {
    const { days = 30 } = req.body;

    // Find customers with anniversaries within next N days
    const result = await client.query(
      `SELECT c.id, c.name, c.email, j.id as first_job_id, j.created_at as first_job_date,
       COUNT(*) OVER (PARTITION BY c.id) as total_jobs,
       SUM(j.estimated_revenue) OVER (PARTITION BY c.id) as lifetime_value
       FROM clients c
       JOIN jobs j ON c.id = j.client_id
       WHERE EXTRACT(DAY FROM (NOW() - j.created_at)) >= 365
       AND EXTRACT(DAY FROM (NOW() - j.created_at)) < 365 + ${days}
       AND NOT EXISTS (
         SELECT 1 FROM anniversary_offers ao 
         WHERE ao.client_id = c.id 
         AND EXTRACT(YEAR FROM ao.created_at) = EXTRACT(YEAR FROM NOW())
       )`
    );

    const customers = result.rows;
    const offers = [];

    for (const customer of customers) {
      const anniversaryDate = new Date(customer.first_job_date);
      const yearsAsCustomer = Math.floor((Date.now() - anniversaryDate) / (1000 * 60 * 60 * 24 * 365));

      // Determine discount based on customer lifetime value
      let discount = 10;
      if (customer.lifetime_value > 5000) discount = 20;
      if (customer.lifetime_value > 10000) discount = 25;

      try {
        await resend.emails.send({
          from: 'vip@deputy.local',
          to: customer.email,
          subject: `${yearsAsCustomer} Years With Us! Enjoy ${discount}% Off Your Next Service`,
          html: `
            <h2>Happy Anniversary!</h2>
            <p>Hi ${customer.name},</p>
            <p>Today marks ${yearsAsCustomer} year${yearsAsCustomer > 1 ? 's' : ''} since you first trusted us with ${customer.total_jobs} job${customer.total_jobs > 1 ? 's' : ''}.</p>
            <p>Thank you for your loyalty! Here's a special ${discount}% discount for you:</p>
            <p><strong>Discount Code:</strong> ANNIVERSARY${yearsAsCustomer}</p>
            <p>Valid for 30 days on any service</p>
            <p><a href="${process.env.DOMAIN}/book?discount=ANNIVERSARY${yearsAsCustomer}">Book Now</a></p>
          `
        });

        // Record the offer
        await client.query(
          `INSERT INTO anniversary_offers (client_id, years, discount_percent, code, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [customer.id, yearsAsCustomer, discount, `ANNIVERSARY${yearsAsCustomer}`]
        );

        offers.push({
          customerId: customer.id,
          customerName: customer.name,
          yearsAsCustomer,
          lifetimeValue: customer.lifetime_value,
          discountPercent: discount
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    res.status(200).json({
      success: true,
      offersGenerated: offers.length,
      offers,
      totalAnniversaryValue: offers.reduce((sum, o) => sum + o.lifetimeValue, 0).toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}