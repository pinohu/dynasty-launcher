import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();

  try {
    switch (action) {
      case 'review-request':
        return sendReviewRequest(payload);
      case 'review-response-draft':
        return draftReviewResponse(payload);
      case 'aggregation-dashboard':
        return generateAggregationDashboard(payload);
      case 'negative-review-alert':
        return alertNegativeReview(payload);
      case 'testimonial-collection':
        return collectTestimonial(payload);
      case 'multi-location-consolidation':
        return consolidateMultiLocationReviews(payload);
      case 'sentiment-analysis':
        return analyzeSentimentTrends(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Reputation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function sendReviewRequest(payload) {
  const { customerId, email, serviceName, platforms, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const request = await db`
    INSERT INTO review_requests (business_id, customer_id, email, service_name, platforms_requested, status)
    VALUES (${businessId}, ${customerId}, ${email}, ${serviceName}, ${JSON.stringify(platforms)}, 'sent')
    RETURNING id
  `;

  const platformLinks = {
    google: 'https://search.google.com/local/writereview',
    yelp: 'https://www.yelp.com/biz/',
    trustpilot: 'https://www.trustpilot.com/review/',
    facebook: 'https://www.facebook.com/'
  };

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: email,
      subject: `Please Share Your Experience with ${serviceName}`,
      template: 'review_request',
      variables: { serviceName, platforms: platforms.join(', ') }
    })
  });

  return NextResponse.json({
    success: true,
    requestId: request.rows[0].id,
    platforms
  });
}

async function draftReviewResponse(payload) {
  const { reviewText, reviewRating, reviewPlatform, businessId } = payload;

  const prompt = reviewRating >= 4 
    ? `Draft a warm, appreciative response to this positive review: "${reviewText}"`
    : `Draft a professional, empathetic response to this ${reviewRating}-star review: "${reviewText}". Focus on resolution and improvement.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const draftedResponse = response.content[0].type === 'text' ? response.content[0].text : '';

  const db = await import('@vercel/postgres').then(m => m.sql);

  const saved = await db`
    INSERT INTO review_responses (business_id, review_platform, review_rating, draft_response, status)
    VALUES (${businessId}, ${reviewPlatform}, ${reviewRating}, ${draftedResponse}, 'draft')
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    responseId: saved.rows[0].id,
    draftedResponse,
    reviewRating
  });
}

async function generateAggregationDashboard(payload) {
  const { businessId, platforms, period } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const reviews = await db`
    SELECT 
      platform,
      COUNT(*) as total_reviews,
      AVG(rating) as avg_rating,
      SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_count,
      SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative_count
    FROM reviews
    WHERE business_id = ${businessId}
      AND platform = ANY(${platforms})
      AND created_at >= NOW() - INTERVAL '${period}'
    GROUP BY platform
  `;

  const overallAvg = reviews.rows.reduce((sum, r) => sum + parseFloat(r.avg_rating || 0), 0) / reviews.rows.length;

  return NextResponse.json({
    success: true,
    period,
    platformMetrics: reviews.rows,
    overallRating: overallAvg.toFixed(1),
    totalReviews: reviews.rows.reduce((sum, r) => sum + parseInt(r.total_reviews), 0)
  });
}

async function alertNegativeReview(payload) {
  const { reviewId, rating, reviewText, platform, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const alert = await db`
    INSERT INTO review_alerts (business_id, review_id, rating, review_text, platform, alert_level, status)
    VALUES (${businessId}, ${reviewId}, ${rating}, ${reviewText}, ${platform}, 
      ${rating <= 2 ? 'critical' : 'warning'}, 'sent')
    RETURNING id
  `;

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subject: `${rating}-Star Review Alert on ${platform}`,
      template: 'negative_review_alert',
      variables: { rating, platform, reviewText }
    })
  });

  return NextResponse.json({
    success: true,
    alertId: alert.rows[0].id,
    severity: rating <= 2 ? 'critical' : 'warning'
  });
}

async function collectTestimonial(payload) {
  const { customerId, email, testimonialText, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const testimonial = await db`
    INSERT INTO testimonials (business_id, customer_id, email, testimonial_text, status, created_at)
    VALUES (${businessId}, ${customerId}, ${email}, ${testimonialText}, 'pending_approval', NOW())
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    testimonialId: testimonial.rows[0].id,
    status: 'pending_approval'
  });
}

async function consolidateMultiLocationReviews(payload) {
  const { businessId, locations, consolidateReviews } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const reviews = await db`
    SELECT 
      location_id,
      COUNT(*) as review_count,
      AVG(rating) as avg_rating
    FROM reviews
    WHERE business_id = ${businessId}
      AND location_id = ANY(${locations})
    GROUP BY location_id
  `;

  const consolidated = await db`
    INSERT INTO consolidated_reviews (business_id, locations, total_reviews, consolidated_rating)
    VALUES (${businessId}, ${JSON.stringify(locations)}, 
      ${reviews.rows.reduce((sum, r) => sum + parseInt(r.review_count), 0)},
      ${(reviews.rows.reduce((sum, r) => sum + parseFloat(r.avg_rating || 0), 0) / reviews.rows.length).toFixed(1)})
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    consolidationId: consolidated.rows[0].id,
    locations: locations.length,
    totalReviews: reviews.rows.reduce((sum, r) => sum + parseInt(r.review_count), 0)
  });
}

async function analyzeSentimentTrends(payload) {
  const { businessId, timePeriod, platforms } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const reviews = await db`
    SELECT 
      DATE_TRUNC('week', created_at) as week,
      rating,
      COUNT(*) as count
    FROM reviews
    WHERE business_id = ${businessId}
      AND platform = ANY(${platforms})
      AND created_at >= NOW() - INTERVAL '${timePeriod}'
    GROUP BY DATE_TRUNC('week', created_at), rating
    ORDER BY week DESC
  `;

  const analysis = {
    trendPositive: reviews.rows.filter(r => r.rating >= 4).length > reviews.rows.length / 2,
    volatility: Math.max(...reviews.rows.map(r => r.rating)) - Math.min(...reviews.rows.map(r => r.rating)),
    trends: reviews.rows
  };

  return NextResponse.json({
    success: true,
    period: timePeriod,
    sentimentTrend: analysis.trendPositive ? 'improving' : 'declining',
    volatility: analysis.volatility,
    weeklyData: analysis.trends
  });
}
