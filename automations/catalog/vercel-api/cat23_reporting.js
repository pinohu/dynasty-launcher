import { Pool } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { createHmac } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const resend = new Resend(process.env.ACUMBAMAIL_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, payload } = req.body;
    
    // Verify webhook signature
    if (process.env.WEBHOOK_SECRET) {
      const signature = req.headers['x-signature'];
      const hash = createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (signature !== hash) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    switch (action) {
      case 'daily_revenue':
        return await handleDailyRevenue(req, res);
      case 'kpi_dashboard':
        return await handleKPIDashboard(req, res);
      case 'client_roi':
        return await handleClientROI(req, res);
      case 'lead_attribution':
        return await handleLeadAttribution(req, res);
      case 'pipeline_velocity':
        return await handlePipelineVelocity(req, res);
      case 'churn_analysis':
        return await handleChurnAnalysis(req, res);
      case 'custom_report':
        return await handleCustomReport(req, res);
      case 'team_scorecard':
        return await handleTeamScorecard(req, res);
      case 'monthly_review':
        return await handleMonthlyReview(req, res);
      case 'alert_engine':
        return await handleAlertEngine(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

async function handleDailyRevenue(req, res) {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT SUM(amount) as total_revenue, COUNT(*) as transaction_count, 
         DATE(created_at) as date FROM payments 
         WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed' 
         GROUP BY DATE(created_at)`
      );

      if (result.rows.length === 0) {
        return res.status(200).json({ total_revenue: 0, transaction_count: 0 });
      }

      const revenue = result.rows[0];
      const metrics = {
        totalRevenue: parseFloat(revenue.total_revenue) || 0,
        transactionCount: parseInt(revenue.transaction_count) || 0,
        date: revenue.date,
        avgTransaction: (parseFloat(revenue.total_revenue) / parseInt(revenue.transaction_count) || 0).toFixed(2)
      };

      // Insert into reports
      await client.query(
        `INSERT INTO reports (type, date, data, created_at) 
         VALUES ('daily_revenue', CURRENT_DATE, $1, NOW())`,
        [JSON.stringify(metrics)]
      );

      // Send email notification
      try {
        await resend.emails.send({
          from: 'reports@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Daily Revenue Snapshot - ${revenue.date}`,
          html: `
            <h2>Daily Revenue Report</h2>
            <p><strong>Date:</strong> ${revenue.date}</p>
            <p><strong>Total Revenue:</strong> $${metrics.totalRevenue.toFixed(2)}</p>
            <p><strong>Transactions:</strong> ${metrics.transactionCount}</p>
            <p><strong>Average Transaction:</strong> $${metrics.avgTransaction}</p>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }

      res.status(200).json(metrics);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleKPIDashboard(req, res) {
  const client = await pool.connect();
  try {
    const [revenueResult, jobsResult, clientResult] = await Promise.all([
      client.query(
        `SELECT SUM(amount) as total FROM payments 
         WHERE created_at > NOW() - interval '30 days'`
      ),
      client.query(
        `SELECT COUNT(*) as total FROM jobs 
         WHERE status = 'completed' AND updated_at > NOW() - interval '30 days'`
      ),
      client.query(
        `SELECT COUNT(DISTINCT client_id) as total FROM jobs 
         WHERE created_at > NOW() - interval '30 days'`
      )
    ]);

    const kpis = {
      revenue: parseFloat(revenueResult.rows[0]?.total || 0),
      jobsCompleted: parseInt(jobsResult.rows[0]?.total || 0),
      clientCount: parseInt(clientResult.rows[0]?.total || 0),
      timestamp: new Date().toISOString()
    };

    // Cache KPI data
    await client.query(
      `INSERT INTO dashboard_kpis (data, updated_at) 
       VALUES ($1, NOW()) 
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(kpis)]
    );

    res.status(200).json(kpis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleClientROI(req, res) {
  const client = await pool.connect();
  try {
    const { clientId } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ error: 'clientId required' });
    }

    const result = await client.query(
      `SELECT c.id, c.name, 
       (SELECT SUM(amount) FROM payments WHERE client_id = $1) as total_spent,
       (SELECT COUNT(*) FROM jobs WHERE client_id = $1 AND status = 'completed') as completed_jobs,
       (SELECT COUNT(*) FROM jobs WHERE client_id = $1) as total_jobs
       FROM clients c WHERE c.id = $1`,
      [clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const row = result.rows[0];
    const roi = row.total_spent ? 
      ((row.completed_jobs * 150 - row.total_spent) / row.total_spent * 100).toFixed(2) : 0;

    const report = {
      clientId: row.id,
      clientName: row.name,
      totalSpent: parseFloat(row.total_spent) || 0,
      completedJobs: parseInt(row.completed_jobs) || 0,
      totalJobs: parseInt(row.total_jobs) || 0,
      roi: parseFloat(roi)
    };

    await client.query(
      `INSERT INTO reports (type, date, data, created_at) 
       VALUES ('client_roi', CURRENT_DATE, $1, NOW())`,
      [JSON.stringify(report)]
    );

    res.status(200).json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleLeadAttribution(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT source, COUNT(*) as count, SUM(value) as total_value,
       SUM(CASE WHEN converted_at IS NOT NULL THEN 1 ELSE 0 END) as converted
       FROM leads WHERE created_at > NOW() - interval '30 days'
       GROUP BY source`
    );

    const attribution = result.rows.map(row => ({
      source: row.source || 'direct',
      totalLeads: parseInt(row.count),
      totalValue: parseFloat(row.total_value) || 0,
      conversionRate: ((parseInt(row.converted) / parseInt(row.count)) * 100).toFixed(2),
      avgValue: (parseFloat(row.total_value) / parseInt(row.count)).toFixed(2)
    }));

    await client.query(
      `INSERT INTO analytics (metric, category, date, data) 
       VALUES ('lead_attribution', 'all_sources', CURRENT_DATE, $1)`,
      [JSON.stringify(attribution)]
    );

    res.status(200).json({ success: true, data: attribution });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handlePipelineVelocity(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT stage, COUNT(*) as count, 
       AVG(EXTRACT(DAY FROM (updated_at - created_at))) as avg_days
       FROM jobs GROUP BY stage`
    );

    const velocity = result.rows.map(row => ({
      stage: row.stage,
      opportunityCount: parseInt(row.count),
      avgDaysInStage: parseFloat(row.avg_days).toFixed(1),
      dailyThroughput: (parseInt(row.count) / Math.max(1, Math.ceil(parseFloat(row.avg_days)))).toFixed(2),
      velocityScore: (parseInt(row.count) * 10 / Math.max(1, parseFloat(row.avg_days))).toFixed(2)
    }));

    const slowStages = velocity.filter(v => parseFloat(v.avgDaysInStage) > 21);

    if (slowStages.length > 0) {
      try {
        await resend.emails.send({
          from: 'alerts@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: 'Pipeline Velocity Alert - Slow Stages Detected',
          html: `<h2>Alert: Pipeline Velocity Issues</h2><ul>${slowStages.map(s => 
            `<li>${s.stage}: ${s.avgDaysInStage} days avg</li>`).join('')}</ul>`
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    res.status(200).json({ success: true, velocity, slowStages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleChurnAnalysis(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT c.id, c.name, MAX(j.completed_at) as last_job_date, COUNT(j.id) as total_jobs
       FROM clients c LEFT JOIN jobs j ON c.id = j.client_id
       GROUP BY c.id, c.name
       HAVING MAX(j.completed_at) < NOW() - interval '90 days'`
    );

    const churned = result.rows;
    const avgJobsBeforeChurn = churned.length > 0 ? 
      (churned.reduce((sum, c) => sum + parseInt(c.total_jobs), 0) / churned.length).toFixed(1) : 0;

    const analysis = {
      atRiskCount: churned.length,
      avgJobsBeforeChurn: parseFloat(avgJobsBeforeChurn),
      churnedClients: churned
    };

    await client.query(
      `INSERT INTO churn_analysis (week, at_risk_count, avg_jobs, data) 
       VALUES (DATE_TRUNC('week', NOW()), $1, $2, $3)`,
      [analysis.atRiskCount, analysis.avgJobsBeforeChurn, JSON.stringify(analysis)]
    );

    res.status(200).json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleCustomReport(req, res) {
  const { reportType, filters = {} } = req.body;

  if (!reportType) {
    return res.status(400).json({ error: 'reportType required' });
  }

  const client = await pool.connect();
  try {
    let query = '';
    
    switch (reportType) {
      case 'jobs':
        query = `SELECT * FROM jobs WHERE 1=1`;
        break;
      case 'clients':
        query = `SELECT * FROM clients WHERE 1=1`;
        break;
      case 'revenue':
        query = `SELECT * FROM payments WHERE 1=1`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid reportType' });
    }

    Object.entries(filters).forEach(([key, val]) => {
      query += ` AND ${key} = '${val.toString().replace(/'/g, "''")}'`;
    });

    const result = await client.query(query);

    res.status(200).json({
      success: true,
      rowCount: result.rowCount,
      data: result.rows,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleTeamScorecard(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT DISTINCT assigned_to FROM jobs 
       WHERE created_at > NOW() - interval '7 days'`
    );

    const members = result.rows;
    const scorecards = await Promise.all(
      members.map(async (member) => {
        const [completed, revenue, rating] = await Promise.all([
          client.query(
            `SELECT COUNT(*) as count FROM jobs 
             WHERE assigned_to = $1 AND status = 'completed' 
             AND completed_at > NOW() - interval '7 days'`,
            [member.assigned_to]
          ),
          client.query(
            `SELECT SUM(amount) as total FROM payments 
             WHERE job_id IN (SELECT id FROM jobs WHERE assigned_to = $1)`,
            [member.assigned_to]
          ),
          client.query(
            `SELECT AVG(rating) as avg_rating FROM reviews 
             WHERE technician_id = $1`,
            [member.assigned_to]
          )
        ]);

        const jobCount = parseInt(completed.rows[0]?.count || 0);
        const totalRev = parseFloat(revenue.rows[0]?.total || 0);
        const avgRate = parseFloat(rating.rows[0]?.avg_rating || 4.5);

        return {
          member: member.assigned_to,
          jobsCompleted: jobCount,
          totalRevenue: totalRev,
          avgRating: avgRate.toFixed(2),
          performanceScore: (jobCount * 20 + totalRev / 50 + avgRate * 30).toFixed(0)
        };
      })
    );

    res.status(200).json({ success: true, scorecards });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleMonthlyReview(req, res) {
  const client = await pool.connect();
  try {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const monthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const monthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

    const result = await client.query(
      `SELECT 
       (SELECT SUM(amount) FROM payments WHERE created_at BETWEEN $1 AND $2) as revenue,
       (SELECT COUNT(*) FROM jobs WHERE completed_at BETWEEN $1 AND $2) as jobs_completed,
       (SELECT COUNT(DISTINCT client_id) FROM jobs WHERE created_at BETWEEN $1 AND $2) as new_clients,
       (SELECT COUNT(*) FROM jobs WHERE created_at BETWEEN $1 AND $2) as jobs_created`,
      [monthStart, monthEnd]
    );

    const data = result.rows[0];
    const review = {
      month: monthStart.toLocaleString('default', { month: 'long', year: 'numeric' }),
      totalRevenue: parseFloat(data.revenue) || 0,
      jobsCompleted: parseInt(data.jobs_completed) || 0,
      newClients: parseInt(data.new_clients) || 0,
      jobsCreated: parseInt(data.jobs_created) || 0
    };

    await client.query(
      `INSERT INTO reports (type, date, data) 
       VALUES ('monthly_review', $1, $2)`,
      [monthStart, JSON.stringify(review)]
    );

    res.status(200).json(review);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function handleAlertEngine(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
       (SELECT SUM(amount) FROM payments WHERE created_at > NOW() - interval '1 hour') as hourly_revenue,
       (SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'assigned')) as active_jobs,
       (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') as open_tickets`
    );

    const kpis = result.rows[0];
    const alerts = [];

    if (parseFloat(kpis.hourly_revenue || 0) < 50) {
      alerts.push({ severity: 'warning', message: 'Hourly revenue below threshold', value: kpis.hourly_revenue });
    }
    if (parseInt(kpis.active_jobs) > 20) {
      alerts.push({ severity: 'warning', message: 'High number of active jobs', value: kpis.active_jobs });
    }
    if (parseInt(kpis.open_tickets) > 10) {
      alerts.push({ severity: 'critical', message: 'Critical support ticket backlog', value: kpis.open_tickets });
    }

    if (alerts.length > 0) {
      try {
        await resend.emails.send({
          from: 'alerts@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: 'System Alerts - Action Required',
          html: `<h2>System Alerts</h2><ul>${alerts.map(a => 
            `<li><strong>[${a.severity.toUpperCase()}]</strong> ${a.message}: ${a.value}</li>`).join('')}</ul>`
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    res.status(200).json({ hasAlerts: alerts.length > 0, alerts, kpis });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}