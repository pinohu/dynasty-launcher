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
      case 'generate_blog':
        return await generateBlogPost(req, res);
      case 'schedule_content':
        return await scheduleContent(req, res);
      case 'repurpose_content':
        return await repurposeContent(req, res);
      case 'generate_case_study':
        return await generateCaseStudy(req, res);
      case 'generate_faq':
        return await generateFAQ(req, res);
      case 'track_performance':
        return await trackPerformance(req, res);
      case 'schedule_seasonal':
        return await scheduleSeasonalContent(req, res);
      case 'generate_local_seo':
        return await generateLocalSEO(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function generateBlogPost(req, res) {
  const client = await pool.connect();
  try {
    const { topic, keywords } = req.body;
    
    if (!topic) {
      return res.status(400).json({ error: 'topic required' });
    }

    // Call OpenAI API for blog generation
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Write a comprehensive blog post about "${topic}". Include SEO-optimized title, meta description, and keywords: ${keywords ? keywords.join(', ') : 'auto-select'}. Format as markdown.`
        }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const openaiData = await openaiResponse.json();
    const blogContent = openaiData.choices[0]?.message?.content || '';

    // Extract title from content
    const titleMatch = blogContent.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1] : `Blog: ${topic}`;

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    await client.query(
      `INSERT INTO content (type, title, slug, content, status, created_at) 
       VALUES ('blog', $1, $2, $3, 'draft', NOW())
       RETURNING id`,
      [title, slug, blogContent]
    );

    res.status(201).json({
      success: true,
      title,
      slug,
      status: 'draft',
      preview: blogContent.substring(0, 500)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function scheduleContent(req, res) {
  const client = await pool.connect();
  try {
    const { contentId, channels, publishDate, times } = req.body;

    if (!contentId || !channels || !publishDate) {
      return res.status(400).json({ error: 'contentId, channels, publishDate required' });
    }

    const scheduled = [];

    for (const channel of channels) {
      const scheduledTime = times?.[channel] || '09:00';
      const [hours, minutes] = scheduledTime.split(':');
      const publishDateTime = new Date(publishDate);
      publishDateTime.setHours(parseInt(hours), parseInt(minutes), 0);

      await client.query(
        `INSERT INTO scheduled_posts (content_id, channel, publish_at, status, created_at)
         VALUES ($1, $2, $3, 'scheduled', NOW())`,
        [contentId, channel, publishDateTime]
      );

      scheduled.push({ channel, publishAt: publishDateTime });
    }

    res.status(201).json({
      success: true,
      scheduled,
      message: `Content scheduled across ${channels.length} channels`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function repurposeContent(req, res) {
  const client = await pool.connect();
  try {
    const { contentId } = req.body;

    if (!contentId) {
      return res.status(400).json({ error: 'contentId required' });
    }

    const contentResult = await client.query(
      `SELECT content FROM content WHERE id = $1 AND type = 'blog'`,
      [contentId]
    );

    if (contentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const blogContent = contentResult.rows[0].content;

    // Generate variations for different platforms
    const variations = {};

    // Social media snippets
    const socialResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Create 3 engaging social media posts (280 chars max) from this content: ${blogContent.substring(0, 1000)}`
        }],
        temperature: 0.8,
        max_tokens: 500
      })
    });

    const socialData = await socialResponse.json();
    variations.social = socialData.choices[0]?.message?.content || '';

    // Email version
    const emailResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Create an engaging email newsletter version (500 words) from this content: ${blogContent.substring(0, 1000)}`
        }],
        temperature: 0.7,
        max_tokens: 600
      })
    });

    const emailData = await emailResponse.json();
    variations.email = emailData.choices[0]?.message?.content || '';

    // Video script
    const videoResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Create a 3-minute video script from this content: ${blogContent.substring(0, 1000)}`
        }],
        temperature: 0.7,
        max_tokens: 700
      })
    });

    const videoData = await videoResponse.json();
    variations.video = videoData.choices[0]?.message?.content || '';

    // Store variations
    await Promise.all([
      client.query(
        `INSERT INTO content (parent_id, type, title, content, status) 
         VALUES ($1, 'social', $2, $3, 'draft')`,
        [contentId, 'Social Media Posts', variations.social]
      ),
      client.query(
        `INSERT INTO content (parent_id, type, title, content, status) 
         VALUES ($1, 'email', $2, $3, 'draft')`,
        [contentId, 'Email Newsletter', variations.email]
      ),
      client.query(
        `INSERT INTO content (parent_id, type, title, content, status) 
         VALUES ($1, 'video', $2, $3, 'draft')`,
        [contentId, 'Video Script', variations.video]
      )
    ]);

    res.status(201).json({
      success: true,
      contentId,
      variations: Object.keys(variations),
      message: 'Content repurposed across 3 channels'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function generateCaseStudy(req, res) {
  const client = await pool.connect();
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId required' });
    }

    const jobResult = await client.query(
      `SELECT j.*, c.name as client_name, c.industry 
       FROM jobs j 
       JOIN clients c ON j.client_id = c.id 
       WHERE j.id = $1 AND j.status = 'completed'`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Completed job not found' });
    }

    const job = jobResult.rows[0];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Create a professional case study for a service business. Client: ${job.client_name}, Industry: ${job.industry}, Service: ${job.title}, Result: ${job.description}. Include challenge, solution, results, and metrics.`
        }],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    const caseStudy = data.choices[0]?.message?.content || '';

    const slug = `case-study-${job.client_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

    await client.query(
      `INSERT INTO content (type, title, slug, content, job_id, status, created_at) 
       VALUES ('case_study', $1, $2, $3, $4, 'draft', NOW())`,
      [`Case Study: ${job.client_name}`, slug, caseStudy, jobId]
    );

    res.status(201).json({
      success: true,
      clientName: job.client_name,
      slug,
      preview: caseStudy.substring(0, 300)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function generateFAQ(req, res) {
  const client = await pool.connect();
  try {
    // Get most common support ticket topics
    const ticketResult = await client.query(
      `SELECT topic, COUNT(*) as count FROM support_tickets 
       WHERE created_at > NOW() - interval '30 days'
       GROUP BY topic ORDER BY count DESC LIMIT 10`
    );

    const topics = ticketResult.rows.map(r => r.topic);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Create a comprehensive FAQ document for a service business. Common topics: ${topics.join(', ')}. Format as Q&A pairs with professional, helpful answers.`
        }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    const faqContent = data.choices[0]?.message?.content || '';

    await client.query(
      `INSERT INTO content (type, title, content, status, created_at) 
       VALUES ('faq', 'Frequently Asked Questions', $1, 'draft', NOW())`,
      [faqContent]
    );

    res.status(201).json({
      success: true,
      topicsIncluded: topics.length,
      preview: faqContent.substring(0, 300)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function trackPerformance(req, res) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cp.content_id, c.title, c.type, 
       SUM(cp.views) as total_views, SUM(cp.clicks) as total_clicks,
       SUM(cp.conversions) as total_conversions,
       DATE(cp.tracked_at) as date
       FROM content_performance cp
       JOIN content c ON cp.content_id = c.id
       WHERE cp.tracked_at > NOW() - interval '30 days'
       GROUP BY cp.content_id, c.title, c.type, DATE(cp.tracked_at)
       ORDER BY total_conversions DESC`
    );

    const performance = result.rows.map(row => ({
      contentId: row.content_id,
      title: row.title,
      type: row.type,
      totalViews: parseInt(row.total_views) || 0,
      totalClicks: parseInt(row.total_clicks) || 0,
      conversions: parseInt(row.total_conversions) || 0,
      ctr: ((parseInt(row.total_clicks) / Math.max(1, parseInt(row.total_views))) * 100).toFixed(2),
      conversionRate: ((parseInt(row.total_conversions) / Math.max(1, parseInt(row.total_clicks))) * 100).toFixed(2),
      date: row.date
    }));

    res.status(200).json({
      success: true,
      data: performance,
      topPerformer: performance.length > 0 ? performance[0] : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function scheduleSeasonalContent(req, res) {
  const client = await pool.connect();
  try {
    const seasons = ['winter', 'spring', 'summer', 'fall'];
    const holidays = ['new_year', 'valentine', 'easter', 'summer', 'thanksgiving', 'christmas'];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'user',
          content: `Create 12 seasonal marketing content ideas (one per month) for a service business. Include holiday tie-ins and seasonal promotions. Format as a monthly calendar.`
        }],
        temperature: 0.8,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    const seasonalContent = data.choices[0]?.message?.content || '';

    await client.query(
      `INSERT INTO content (type, title, content, status, created_at) 
       VALUES ('seasonal_calendar', 'Annual Seasonal Content Calendar', $1, 'draft', NOW())`,
      [seasonalContent]
    );

    res.status(201).json({
      success: true,
      contentCreated: 'Seasonal Calendar',
      preview: seasonalContent.substring(0, 400)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function generateLocalSEO(req, res) {
  const client = await pool.connect();
  try {
    const { cities = [], services = [] } = req.body;

    if (cities.length === 0 || services.length === 0) {
      return res.status(400).json({ error: 'cities and services required' });
    }

    const pages = [];

    for (const city of cities) {
      for (const service of services) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{
              role: 'user',
              content: `Create an SEO-optimized landing page for "${service}" services in "${city}". Include city-specific content, local keywords, and service details. Format as HTML with metadata.`
            }],
            temperature: 0.7,
            max_tokens: 1200
          })
        });

        const data = await response.json();
        const pageContent = data.choices[0]?.message?.content || '';
        const slug = `${service.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-in-${city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

        await client.query(
          `INSERT INTO content (type, title, slug, content, status, created_at) 
           VALUES ('landing_page', $1, $2, $3, 'draft', NOW())`,
          [`${service} in ${city}`, slug, pageContent]
        );

        pages.push({ city, service, slug });
      }
    }

    res.status(201).json({
      success: true,
      pagesCreated: pages.length,
      pages,
      message: `Generated ${pages.length} local SEO landing pages`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}