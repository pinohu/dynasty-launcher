/**
 * Post-Job Review Request API
 * Vercel serverless function for handling review request triggers and webhooks
 * Platform: Your Deputy
 * Pack: Reviews Pack
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Initialize n8n webhook client
const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_WEBHOOK_URL = `${N8N_BASE_URL}/webhook/post-job-review-request`;

export default async function handler(req: NextRequest) {
  if (req.method === 'POST') {
    return handleReviewRequest(req);
  } else if (req.method === 'GET') {
    return handleGetReviewStatus(req);
  } else if (req.method === 'PATCH') {
    return handleUpdateReviewStatus(req);
  }
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * Trigger a review request workflow
 * Called when a job is marked as completed
 */
async function handleReviewRequest(req: NextRequest) {
  try {
    const payload = await req.json();
    const {
      jobId,
      customerId,
      serviceType,
      completionDate,
      technicianName,
      delayHours = 2,
      channels = ['email', 'sms'],
      maxRequests = 3,
      followUpDays = 7,
    } = payload;

    // Validate required fields
    if (!jobId || !customerId) {
      return NextResponse.json(
        { error: 'jobId and customerId are required' },
        { status: 400 }
      );
    }

    // Check request limits
    const { data: requestCount } = await supabase
      .from('review_requests')
      .select('id', { count: 'exact' })
      .eq('customer_id', customerId)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (requestCount && requestCount.length >= maxRequests) {
      return NextResponse.json(
        { error: 'Max review requests exceeded for this customer' },
        { status: 429 }
      );
    }

    // Create review request record
    const { data: reviewRequest, error: dbError } = await supabase
      .from('review_requests')
      .insert([
        {
          job_id: jobId,
          customer_id: customerId,
          service_type: serviceType,
          completion_date: completionDate,
          technician_name: technicianName,
          status: 'pending',
          channels: channels,
          follow_up_days: followUpDays,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to create review request' },
        { status: 500 }
      );
    }

    // Trigger n8n workflow
    const n8nPayload = {
      event: 'job.completed',
      job_id: jobId,
      customer_id: customerId,
      service_type: serviceType,
      completion_date: completionDate,
      technician_name: technicianName,
      delay_hours: delayHours,
      channels: channels,
      max_requests: maxRequests,
      follow_up_days: followUpDays,
      request_id: reviewRequest.id,
    };

    try {
      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.N8N_API_KEY}`,
        },
        body: JSON.stringify(n8nPayload),
      });

      if (!n8nResponse.ok) {
        console.error('n8n workflow failed:', await n8nResponse.text());
      }
    } catch (n8nError) {
      console.error('Error triggering n8n workflow:', n8nError);
      // Continue - the request was created successfully in DB
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Review request initiated',
        request_id: reviewRequest.id,
        job_id: jobId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in review request handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get review request status
 * Returns current status and submission data
 */
async function handleGetReviewStatus(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const jobId = searchParams.get('jobId');
    const customerId = searchParams.get('customerId');

    if (!jobId && !customerId) {
      return NextResponse.json(
        { error: 'jobId or customerId is required' },
        { status: 400 }
      );
    }

    let query = supabase.from('review_requests').select('*');

    if (jobId) {
      query = query.eq('job_id', jobId);
    } else if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data: reviewRequests, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch review requests' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: reviewRequests || [],
      count: reviewRequests?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching review status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Update review request status
 * Called when a review is submitted or rating is selected
 */
async function handleUpdateReviewStatus(req: NextRequest) {
  try {
    const payload = await req.json();
    const {
      requestId,
      status,
      rating,
      reviewUrl,
      feedbackText,
      submittedAt,
    } = payload;

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId is required' },
        { status: 400 }
      );
    }

    // Update review request
    const { data: updated, error: updateError } = await supabase
      .from('review_requests')
      .update({
        status: status || 'submitted',
        rating: rating,
        review_url: reviewUrl,
        feedback_text: feedbackText,
        submitted_at: submittedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update review request' },
        { status: 500 }
      );
    }

    // Log to analytics
    await logAnalytics({
      event_type: 'review_submitted',
      request_id: requestId,
      rating: rating,
      has_feedback: !!feedbackText,
    });

    // Send thank you email via n8n if configured
    if (updated && process.env.SEND_THANK_YOU_EMAIL === 'true') {
      try {
        await fetch(`${N8N_BASE_URL}/webhook/post-job-review-thank-you`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.N8N_API_KEY}`,
          },
          body: JSON.stringify({
            customer_id: updated.customer_id,
            request_id: requestId,
            rating: rating,
          }),
        });
      } catch (e) {
        console.error('Error sending thank you email:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Review request updated',
      data: updated,
    });
  } catch (error) {
    console.error('Error updating review status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Log event for analytics
 */
async function logAnalytics(event: any) {
  try {
    await supabase.from('events').insert([
      {
        event_type: event.event_type,
        metadata: event,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    console.error('Analytics logging error:', e);
  }
}

// Health check endpoint
export async function GET(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/health') {
    return NextResponse.json({ status: 'ok' });
  }
  return handler(req);
}
