import { Pool } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { randomBytes } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const resend = new Resend(process.env.ACUMBAMAIL_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, payload } = req.body;

    switch (action) {
      case 'generate_link':
        return await generateReferralLink(req, res);
      case 'track_conversion':
        return await trackReferralConversion(req, res);
      case 'process_payouts':
        return await processRewardPayouts(req, res);
      case 'dashboard_data':
        return await getPartnerDashboard(req, res);
      case 'launch_campaign':
        return await launchReferralCampaign(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function generateReferralLink(req, res) {
  const client = await pool.connect();
  try {
    const { customerId, email, name } = req.body;

    if (!customerId || !email) {
      return res.status(400).json({ error: 'customerId and email required' });
    }

    // Generate unique referral code
    const referralCode = randomBytes(8).toString('hex').toUpperCase().slice(0, 12);
    const referralLink = `${process.env.DOMAIN}/ref/${referralCode}`;

    // Check if customer already has referral code
    const existingResult = await client.query(
      `SELECT referral_code FROM referral_programs WHERE customer_id = $1`,
      [customerId]
    );

    let code = referralCode;
    if (existingResult.rows.length > 0) {
      code = existingResult.rows[0].referral_code;
      return res.status(200).json({
        success: true,
        customerId,
        referralCode: code,
        referralLink: `${process.env.DOMAIN}/ref/${code}`
      });
    }

    // Create new referral program entry
    const insertResult = await client.query(
      `INSERT INTO referral_programs (customer_id, email, name, referral_code, status, created_at)
       VALUES ($1, $2, $3, $4, 'active', NOW())
       RETURNING referral_code`,
      [customerId, email, name, referralCode]
    );

    // Send referral program welcome email
    try {
      await resend.emails.send({
        from: 'referrals@deputy.local',
        to: email,
        subject: 'Your Referral Program Link is Ready!',
        html: `
          <h2>Welcome to Our Referral Program!</h2>
          <p>Hi ${name || 'there'},</p>
          <p>Your unique referral link is ready to use:</p>
          <p><strong><a href="${referralLink}">${referralLink}</a></strong></p>
          <p>Share this link with friends and earn rewards for each successful referral!</p>
          <p><strong>Earn:</strong></p>
          <ul>
            <li>$25 credit for each referred customer</li>
            <li>Bonus $100 after 5 successful referrals</li>
          </ul>
          <p><a href="${process.env.DOMAIN}/referrals/dashboard">View Your Dashboard</a></p>
        `
      });
    } catch (emailError) {
      console.error('Email send failed:', emailError);
    }

    res.status(201).json({
      success: true,
      customerId,
      referralCode,
      referralLink,
      message: 'Referral link generated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function trackReferralConversion(req, res) {
  const client = await pool.connect();
  try {
    const { referralCode, newCustomerId, conversionValue = 0 } = req.body;

    if (!referralCode || !newCustomerId) {
      return res.status(400).json({ error: 'referralCode and newCustomerId required' });
    }

    // Find referrer
    const referrerResult = await client.query(
      `SELECT customer_id, email, name FROM referral_programs WHERE referral_code = $1`,
      [referralCode]
    );

    if (referrerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Referral code not found' });
    }

    const referrer = referrerResult.rows[0];

    // Record conversion
    const conversionResult = await client.query(
      `INSERT INTO referral_conversions (referrer_id, new_customer_id, conversion_value, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       RETURNING id`,
      [referrer.customer_id, newCustomerId, conversionValue]
    );

    const conversionId = conversionResult.rows[0].id;

    // Credit referrer (calculate reward - 10% of conversion value or $25 minimum)
    const rewardAmount = Math.max(25, conversionValue * 0.1);

    await client.query(
      `UPDATE referral_programs 
       SET total_conversions = total_conversions + 1,
           earned_credits = earned_credits + $1,
           updated_at = NOW()
       WHERE customer_id = $2`,
      [rewardAmount, referrer.customer_id]
    );

    // Check for milestone bonuses
    const referrerStats = await client.query(
      `SELECT total_conversions, earned_credits FROM referral_programs WHERE customer_id = $1`,
      [referrer.customer_id]
    );

    const stats = referrerStats.rows[0];
    const conversions = stats.total_conversions + 1;
    let bonusMessage = '';

    if (conversions === 5) {
      const bonusAmount = 100;
      await client.query(
        `UPDATE referral_programs 
         SET earned_credits = earned_credits + $1 
         WHERE customer_id = $2`,
        [bonusAmount, referrer.customer_id]
      );
      bonusMessage = `\n\n🎉 MILESTONE BONUS! You've reached 5 referrals! $${bonusAmount} bonus credited.`;
    } else if (conversions === 10) {
      const bonusAmount = 250;
      await client.query(
        `UPDATE referral_programs 
         SET earned_credits = earned_credits + $1 
         WHERE customer_id = $2`,
        [bonusAmount, referrer.customer_id]
      );
      bonusMessage = `\n\n🎉 MILESTONE BONUS! You've reached 10 referrals! $${bonusAmount} bonus credited.`;
    }

    // Send notification email
    try {
      await resend.emails.send({
        from: 'referrals@deputy.local',
        to: referrer.email,
        subject: 'Referral Conversion Confirmed!',
        html: `
          <h2>Congratulations!</h2>
          <p>Your referral was successful!</p>
          <p><strong>Reward:</strong> $${rewardAmount.toFixed(2)} credited to your account</p>
          <p><strong>Total Earned:</strong> $${(stats.earned_credits + rewardAmount).toFixed(2)}</p>
          ${bonusMessage ? `<p>${bonusMessage}</p>` : ''}
          <p><a href="${process.env.DOMAIN}/referrals/dashboard">View Dashboard</a></p>
        `
      });
    } catch (emailError) {
      console.error('Email send failed:', emailError);
    }

    res.status(201).json({
      success: true,
      conversionId,
      referrerId: referrer.customer_id,
      newCustomerId,
      rewardAmount: rewardAmount.toFixed(2),
      totalEarned: (stats.earned_credits + rewardAmount).toFixed(2),
      totalConversions: conversions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function processRewardPayouts(req, res) {
  const client = await pool.connect();
  try {
    const { minimumBalance = 50 } = req.body;

    // Get all referrers with pending payouts
    const result = await client.query(
      `SELECT customer_id, email, name, earned_credits 
       FROM referral_programs 
       WHERE earned_credits >= $1 AND last_payout_at < NOW() - interval '30 days'
       ORDER BY earned_credits DESC`,
      [minimumBalance]
    );

    const payouts = result.rows;
    const processed = [];

    for (const payout of payouts) {
      try {
        // Process payment via Stripe
        const paymentResult = await fetch('https://api.stripe.com/v1/payouts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            amount: Math.floor(parseFloat(payout.earned_credits) * 100),
            currency: 'usd',
            method: 'instant',
            metadata: {
              customer_id: payout.customer_id,
              referral_payout: 'true'
            }
          })
        });

        if (paymentResult.ok) {
          // Mark as processed
          await client.query(
            `UPDATE referral_programs 
             SET earned_credits = 0, last_payout_at = NOW()
             WHERE customer_id = $1`,
            [payout.customer_id]
          );

          // Record payout
          await client.query(
            `INSERT INTO referral_payouts (customer_id, amount, status, created_at)
             VALUES ($1, $2, 'completed', NOW())`,
            [payout.customer_id, parseFloat(payout.earned_credits)]
          );

          // Send confirmation email
          try {
            await resend.emails.send({
              from: 'payouts@deputy.local',
              to: payout.email,
              subject: 'Referral Payout Processed!',
              html: `
                <h2>Payout Processed</h2>
                <p>Hi ${payout.name},</p>
                <p>Your referral rewards payout has been processed!</p>
                <p><strong>Amount:</strong> $${parseFloat(payout.earned_credits).toFixed(2)}</p>
                <p>The funds should appear in your account within 1-2 business days.</p>
              `
            });
          } catch (emailError) {
            console.error('Email send failed:', emailError);
          }

          processed.push({
            customerId: payout.customer_id,
            amount: parseFloat(payout.earned_credits),
            status: 'completed'
          });
        }
      } catch (paymentError) {
        console.error('Payout processing failed:', paymentError);
        processed.push({
          customerId: payout.customer_id,
          amount: parseFloat(payout.earned_credits),
          status: 'failed',
          error: paymentError.message
        });
      }
    }

    res.status(200).json({
      success: true,
      payoutsProcessed: processed.length,
      totalAmount: processed
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0)
        .toFixed(2),
      payouts: processed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function getPartnerDashboard(req, res) {
  const client = await pool.connect();
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId required' });
    }

    const programResult = await client.query(
      `SELECT referral_code, total_conversions, earned_credits, created_at
       FROM referral_programs WHERE customer_id = $1`,
      [customerId]
    );

    if (programResult.rows.length === 0) {
      return res.status(404).json({ error: 'Referral program not found' });
    }

    const program = programResult.rows[0];

    const conversionsResult = await client.query(
      `SELECT conversion_value, status, created_at FROM referral_conversions 
       WHERE referrer_id = $1 ORDER BY created_at DESC`,
      [customerId]
    );

    const conversions = conversionsResult.rows;
    const pendingValue = conversions
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + parseFloat(c.conversion_value), 0);

    const dashboard = {
      referralCode: program.referral_code,
      referralLink: `${process.env.DOMAIN}/ref/${program.referral_code}`,
      totalConversions: parseInt(program.total_conversions),
      earnedCredits: parseFloat(program.earned_credits),
      pendingValue: pendingValue,
      totalValue: conversions.reduce((sum, c) => sum + parseFloat(c.conversion_value), 0),
      memberSince: program.created_at,
      recentConversions: conversions.slice(0, 10),
      stats: {
        conversionRate: ((parseInt(program.total_conversions) / Math.max(1, parseInt(program.total_conversions))) * 100).toFixed(2),
        averageValue: (conversions.reduce((sum, c) => sum + parseFloat(c.conversion_value), 0) / Math.max(1, conversions.length)).toFixed(2)
      }
    };

    res.status(200).json({
      success: true,
      dashboard
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function launchReferralCampaign(req, res) {
  const client = await pool.connect();
  try {
    const { campaignName, bonusAmount = 25, targetCustomers = 'all' } = req.body;

    if (!campaignName) {
      return res.status(400).json({ error: 'campaignName required' });
    }

    // Get target customers
    let query = `SELECT email, name FROM referral_programs WHERE status = 'active'`;
    if (targetCustomers === 'high_performers') {
      query += ` AND total_conversions >= 5`;
    } else if (targetCustomers === 'inactive') {
      query += ` AND updated_at < NOW() - interval '30 days'`;
    }

    const result = await client.query(query);
    const customers = result.rows;

    // Create campaign record
    const campaignResult = await client.query(
      `INSERT INTO referral_campaigns (name, bonus_amount, target_count, status, created_at)
       VALUES ($1, $2, $3, 'active', NOW())
       RETURNING id`,
      [campaignName, bonusAmount, customers.length]
    );

    const campaignId = campaignResult.rows[0].id;

    // Send campaign emails
    const emailsSent = [];
    for (const customer of customers) {
      try {
        await resend.emails.send({
          from: 'campaigns@deputy.local',
          to: customer.email,
          subject: `Boost Your Referral Earnings! $${bonusAmount} Bonus Inside`,
          html: `
            <h2>${campaignName}</h2>
            <p>Hi ${customer.name},</p>
            <p>We're running a special referral promotion!</p>
            <p><strong>Special Offer:</strong> Get an extra $${bonusAmount} bonus on your next 3 referrals!</p>
            <p><a href="${process.env.DOMAIN}/referrals">Start Referring Now</a></p>
          `
        });
        emailsSent.push({ email: customer.email, status: 'sent' });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
        emailsSent.push({ email: customer.email, status: 'failed' });
      }
    }

    res.status(201).json({
      success: true,
      campaignId,
      campaignName,
      emailsSent: emailsSent.filter(e => e.status === 'sent').length,
      totalTargeted: customers.length,
      bonusAmount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}