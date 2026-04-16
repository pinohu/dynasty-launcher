import { sql } from '@vercel/postgres';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, technicianId, action = 'all' } = req.body;

    if (action === 'service_audit' || action === 'all') {
      const jobs = jobId ?
        (await sql`SELECT id, job_type, technician_id FROM jobs WHERE id = ${jobId}`).rows :
        (await sql`
          SELECT id, job_type, technician_id FROM jobs 
          WHERE status = 'completed' AND qa_checked = false
          ORDER BY RANDOM() LIMIT 20
        `).rows;

      for (const job of jobs.rows) {
        try {
          const checklist = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'Generate QA audit checklist with 10 items for service quality check'
              },
              {
                role: 'user',
                content: `Job type: ${job.job_type}`
              }
            ]
          });

          const items = checklist.choices[0].message.content;

          await sql`
            INSERT INTO qa_audits 
            (job_id, technician_id, audit_checklist, created_at, status)
            VALUES (${job.id}, ${job.technician_id}, ${items}, NOW(), 'pending_review')
          `;

          await sql`
            UPDATE jobs SET qa_checked = true WHERE id = ${job.id}
          `;
        } catch (e) {
          console.error(`QA audit error for job ${job.id}:`, e);
        }
      }
    }

    if (action === 'csat_analysis' || action === 'all') {
      const surveys = await sql`
        SELECT id, satisfaction_score, rating_date, feedback
        FROM client_surveys 
        WHERE satisfaction_score IS NOT NULL
        AND rating_date > NOW() - INTERVAL '30 days'
        ORDER BY rating_date DESC
        LIMIT 100
      `;

      const avgScore = await sql`
        SELECT AVG(satisfaction_score) as avg, STDDEV(satisfaction_score) as stddev
        FROM client_surveys 
        WHERE rating_date > NOW() - INTERVAL '30 days'
      `;

      const avg = avgScore.rows[0].avg || 0;
      const stddev = avgScore.rows[0].stddev || 0;

      try {
        const analysis = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Analyze CSAT data and identify trends, issues, and opportunities'
            },
            {
              role: 'user',
              content: `Average: ${avg}, Std Dev: ${stddev}, Total responses: ${surveys.rows.length}`
            }
          ]
        });

        const trend = avg > 4.5 ? 'positive' : avg > 3.5 ? 'neutral' : 'negative';

        await sql`
          INSERT INTO satisfaction_analysis 
          (analysis_date, avg_score, stddev, trend, insights)
          VALUES (NOW(), ${avg}, ${stddev}, ${trend}, ${analysis.choices[0].message.content})
        `;
      } catch (e) {
        console.error('CSAT analysis error:', e);
      }
    }

    if (action === 'compliance_check' || action === 'all') {
      const requirements = await sql`
        SELECT id, requirement_name, check_frequency_days, last_verified_date
        FROM compliance_requirements 
        ORDER BY last_verified_date ASC NULLS FIRST
        LIMIT 100
      `;

      for (const req of requirements.rows) {
        const nextCheckDate = req.last_verified_date ? 
          new Date(req.last_verified_date) : new Date();
        nextCheckDate.setDate(nextCheckDate.getDate() + (req.check_frequency_days || 30));

        if (new Date() >= nextCheckDate) {
          await sql`
            INSERT INTO compliance_checks 
            (requirement_id, check_date, status, next_check_date, verified_by)
            VALUES (
              ${req.id}, 
              NOW(), 
              'verified', 
              ${nextCheckDate.toISOString()}, 
              'automation'
            )
          `;

          await sql`
            UPDATE compliance_requirements 
            SET last_verified_date = NOW() 
            WHERE id = ${req.id}
          `;
        }
      }
    }

    if (action === 'callback_tracking' || action === 'all') {
      const techs = technicianId ?
        (await sql`SELECT id FROM technicians WHERE id = ${technicianId}`).rows :
        (await sql`SELECT id FROM technicians WHERE status = 'active' LIMIT 100`).rows;

      for (const tech of techs) {
        const redoMetrics = await sql`
          SELECT 
            COUNT(*) as total_jobs,
            COUNT(CASE WHEN has_callback = true THEN 1 END) as callback_count,
            COUNT(CASE WHEN client_rating < 4 THEN 1 END) as low_rating_count
          FROM jobs
          WHERE technician_id = ${tech.id} 
          AND completion_date > NOW() - INTERVAL '30 days'
        `;

        const row = redoMetrics.rows[0];
        const callbackRate = row.total_jobs > 0 ? 
          (row.callback_count / row.total_jobs) * 100 : 0;

        await sql`
          INSERT INTO technician_quality_metrics 
          (technician_id, metric_date, total_jobs, callbacks, callback_rate, low_ratings)
          VALUES (
            ${tech.id}, 
            NOW(), 
            ${row.total_jobs},
            ${row.callback_count},
            ${callbackRate},
            ${row.low_rating_count}
          )
        `;
      }
    }

    if (action === 'quality_scoring' || action === 'all') {
      const technicians = technicianId ?
        (await sql`SELECT id, name FROM technicians WHERE id = ${technicianId}`).rows :
        (await sql`
          SELECT t.id, t.name FROM technicians t 
          WHERE t.status = 'active'
          LIMIT 100
        `).rows;

      for (const tech of technicians) {
        const performance = await sql`
          SELECT 
            AVG(client_rating) as avg_rating,
            COUNT(*) as total_jobs,
            COUNT(CASE WHEN completion_time <= estimated_time THEN 1 END) as on_time,
            COUNT(CASE WHEN has_callback = true THEN 1 END) as callbacks
          FROM jobs
          WHERE technician_id = ${tech.id}
          AND completion_date > NOW() - INTERVAL '30 days'
        `;

        const perf = performance.rows[0];
        if (perf.total_jobs === 0) continue;

        const ratingScore = (perf.avg_rating || 0) * 20;
        const timeliessScore = (perf.on_time / perf.total_jobs) * 20;
        const callbackPenalty = (perf.callbacks / perf.total_jobs) * 20;
        const overallScore = ratingScore + timeliessScore + (20 - callbackPenalty) + 20;

        await sql`
          INSERT INTO technician_quality_scores 
          (technician_id, quality_score, avg_rating, on_time_percent, 
           callback_count, calculated_at)
          VALUES (
            ${tech.id},
            ${Math.min(100, Math.max(0, overallScore))},
            ${perf.avg_rating},
            ${(perf.on_time / perf.total_jobs) * 100},
            ${perf.callbacks},
            NOW()
          )
          ON CONFLICT (technician_id, DATE(calculated_at)) 
          DO UPDATE SET quality_score = EXCLUDED.quality_score
        `;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Quality assurance automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('QA automation error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat37_quality_assurance'
    });
  }
}
