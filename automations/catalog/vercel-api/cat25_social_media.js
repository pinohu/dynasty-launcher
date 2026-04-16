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
      case 'schedule_post':
        return await schedulePost(req, res);
      case 'monitor_comments':
        return await monitorComments(req, res);
      case 'collect_ugc':
        return await collectUGC(req, res);
      case 'track_hashtags':
        return await trackHashtags(req, res);
      case 'aggregate_engagement':
        return await aggregateEngagement(req, res);
      case 'social_listening':
        return await socialListening(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function schedulePost(req, res) {
  const client = await pool.connect();
  try {
    const { platforms, content, scheduledTime, mediaUrls = [] } = req.body;

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ error: 'platforms array required' });
    }
    if (!content) {
      return res.status(400).json({ error: 'content required' });
    }
    if (!scheduledTime) {
      return res.status(400).json({ error: 'scheduledTime required' });
    }

    const publishTime = new Date(scheduledTime);

    const scheduled = await Promise.all(
      platforms.map(async (platform) => {
        const result = await client.query(
          `INSERT INTO social_posts (platform, content, media_urls, scheduled_at, status, created_at)
           VALUES ($1, $2, $3, $4, 'scheduled', NOW())
           RETURNING id, scheduled_at`,
          [platform, content, JSON.stringify(mediaUrls), publishTime]
        );

        return {
          platform,
          postId: result.rows[0].id,
          scheduledAt: result.rows[0].scheduled_at
        };
      })
    );

    res.status(201).json({
      success: true,
      scheduled,
      message: `Post scheduled for ${platforms.length} platform(s)`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function monitorComments(req, res) {
  const client = await pool.connect();
  try {
    const { platforms = ['facebook', 'instagram', 'twitter', 'linkedin'] } = req.body;

    const result = await client.query(
      `SELECT id, platform, post_id, comment_text, author, sentiment, created_at
       FROM social_comments 
       WHERE created_at > NOW() - interval '1 hour'
       AND response_status IS NULL
       ORDER BY created_at DESC
       LIMIT 50`
    );

    const comments = result.rows;
    const alerts = [];

    // Filter for high-priority comments (negative sentiment, high-value accounts, etc.)
    const priorityComments = comments.filter(c => 
      c.sentiment === 'negative' || 
      c.author.followers > 1000 ||
      c.comment_text.includes('urgent') ||
      c.comment_text.includes('help')
    );

    if (priorityComments.length > 0) {
      alerts.push({
        severity: 'high',
        count: priorityComments.length,
        comments: priorityComments.slice(0, 5)
      });

      // Send alert email
      try {
        await resend.emails.send({
          from: 'social@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Social Media Alert: ${priorityComments.length} Priority Comments Need Response`,
          html: `
            <h2>Social Media Alert</h2>
            <p>Found ${priorityComments.length} comments requiring immediate attention.</p>
            <ul>
              ${priorityComments.slice(0, 5).map(c => 
                `<li><strong>${c.author}</strong> on ${c.platform}: "${c.comment_text}"</li>`
              ).join('')}
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    // Store all comments
    await client.query(
      `INSERT INTO social_comments_processed (comments, alert_sent, processed_at)
       VALUES ($1, $2, NOW())`,
      [JSON.stringify(comments), alerts.length > 0]
    );

    res.status(200).json({
      success: true,
      totalComments: comments.length,
      priorityComments: priorityComments.length,
      alerts,
      comments: comments.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function collectUGC(req, res) {
  const client = await pool.connect();
  try {
    const { hashtags = [], searchTerms = [] } = req.body;

    if (hashtags.length === 0 && searchTerms.length === 0) {
      return res.status(400).json({ error: 'hashtags or searchTerms required' });
    }

    // Simulate fetching from social media APIs (in production, use actual API calls)
    const ugcResult = await client.query(
      `SELECT id, platform, content, media_url, author, author_url, engagement_count
       FROM social_ugc
       WHERE created_at > NOW() - interval '24 hours'
       AND status = 'pending_review'
       ORDER BY engagement_count DESC
       LIMIT 20`
    );

    const ugcContent = ugcResult.rows;

    // Mark as collected and curate
    const curated = await Promise.all(
      ugcContent.map(async (item) => {
        await client.query(
          `UPDATE social_ugc SET status = 'collected', collected_at = NOW() 
           WHERE id = $1`,
          [item.id]
        );

        return {
          id: item.id,
          platform: item.platform,
          preview: item.content.substring(0, 100),
          author: item.author,
          engagement: item.engagement_count
        };
      })
    );

    res.status(200).json({
      success: true,
      collectedCount: curated.length,
      content: curated
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function trackHashtags(req, res) {
  const client = await pool.connect();
  try {
    const { hashtags = [] } = req.body;

    const result = await client.query(
      `SELECT hashtag, platform, post_count, reach, impressions, engagement,
       engagement_rate, DATE(tracked_at) as date
       FROM hashtag_analytics
       WHERE tracked_at > NOW() - interval '7 days'
       ORDER BY engagement DESC
       LIMIT 50`
    );

    const performance = result.rows.map(row => ({
      hashtag: row.hashtag,
      platform: row.platform,
      posts: parseInt(row.post_count),
      reach: parseInt(row.reach),
      impressions: parseInt(row.impressions),
      engagement: parseInt(row.engagement),
      engagementRate: parseFloat(row.engagement_rate).toFixed(2),
      date: row.date
    }));

    const topPerformers = performance.sort((a, b) => b.engagement - a.engagement).slice(0, 5);

    await client.query(
      `INSERT INTO hashtag_reports (data, top_performers, tracked_at)
       VALUES ($1, $2, NOW())`,
      [JSON.stringify(performance), JSON.stringify(topPerformers)]
    );

    res.status(200).json({
      success: true,
      totalHashtags: performance.length,
      topPerformers,
      allData: performance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function aggregateEngagement(req, res) {
  const client = await pool.connect();
  try {
    const platforms = ['facebook', 'instagram', 'twitter', 'linkedin'];

    const result = await client.query(
      `SELECT platform, 
       SUM(likes) as total_likes,
       SUM(comments) as total_comments,
       SUM(shares) as total_shares,
       SUM(views) as total_views,
       COUNT(*) as post_count,
       DATE(created_at) as date
       FROM social_metrics
       WHERE created_at > NOW() - interval '30 days'
       GROUP BY platform, DATE(created_at)
       ORDER BY date DESC`
    );

    const metrics = result.rows.map(row => ({
      platform: row.platform,
      totalLikes: parseInt(row.total_likes) || 0,
      totalComments: parseInt(row.total_comments) || 0,
      totalShares: parseInt(row.total_shares) || 0,
      totalViews: parseInt(row.total_views) || 0,
      postCount: parseInt(row.post_count),
      avgEngagement: (
        (parseInt(row.total_likes) + parseInt(row.total_comments) + parseInt(row.total_shares)) / 
        Math.max(1, parseInt(row.post_count))
      ).toFixed(2),
      date: row.date
    }));

    const summary = {
      totalEngagement: metrics.reduce((sum, m) => 
        sum + m.totalLikes + m.totalComments + m.totalShares, 0),
      topPlatform: metrics.length > 0 ? metrics.reduce((prev, curr) => 
        curr.totalEngagement > prev.totalEngagement ? curr : prev) : null,
      metrics
    };

    res.status(200).json({
      success: true,
      summary,
      detailedMetrics: metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}

async function socialListening(req, res) {
  const client = await pool.connect();
  try {
    const { keywords = [], brands = [] } = req.body;
    const searchTerms = [...keywords, ...brands];

    if (searchTerms.length === 0) {
      return res.status(400).json({ error: 'keywords or brands required' });
    }

    const result = await client.query(
      `SELECT platform, mention_text, author, author_followers, sentiment, 
       engagement_count, created_at
       FROM social_mentions
       WHERE created_at > NOW() - interval '24 hours'
       ORDER BY engagement_count DESC
       LIMIT 100`
    );

    const mentions = result.rows;

    // Categorize by sentiment
    const bySentiment = {
      positive: mentions.filter(m => m.sentiment === 'positive'),
      neutral: mentions.filter(m => m.sentiment === 'neutral'),
      negative: mentions.filter(m => m.sentiment === 'negative')
    };

    // Alert on negative mentions
    if (bySentiment.negative.length > 0) {
      const topNegative = bySentiment.negative.sort((a, b) => 
        b.author_followers - a.author_followers).slice(0, 3);

      try {
        await resend.emails.send({
          from: 'listening@deputy.local',
          to: process.env.ADMIN_EMAIL,
          subject: `Social Listening Alert: ${topNegative.length} Negative Mentions`,
          html: `
            <h2>Negative Social Mentions</h2>
            <ul>
              ${topNegative.map(m => 
                `<li><strong>@${m.author}</strong> (${m.author_followers} followers): "${m.mention_text}"</li>`
              ).join('')}
            </ul>
          `
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    await client.query(
      `INSERT INTO social_listening_reports (keyword_count, positive_count, neutral_count, 
       negative_count, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        searchTerms.length,
        bySentiment.positive.length,
        bySentiment.neutral.length,
        bySentiment.negative.length,
        JSON.stringify(mentions)
      ]
    );

    res.status(200).json({
      success: true,
      totalMentions: mentions.length,
      sentiment: {
        positive: bySentiment.positive.length,
        neutral: bySentiment.neutral.length,
        negative: bySentiment.negative.length
      },
      topMentions: mentions.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}