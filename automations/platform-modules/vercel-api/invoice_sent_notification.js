/**
 * Invoice Sent Notification API
 * Vercel serverless function for invoice notification handling
 * Platform: Your Deputy
 * Pack: Billing Pack
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_WEBHOOK_URL = `${N8N_BASE_URL}/webhook/invoice-sent-notification`;

export default async function handler(req: NextRequest) {
  if (req.method === 'POST') {
    return handleInvoiceNotification(req);
  } else if (req.method === 'GET') {
    return handleGetInvoiceStatus(req);
  } else if (req.method === 'PATCH') {
    return handleUpdateNotificationStatus(req);
  }
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * Handle incoming invoice notification
 * Triggered by Stripe webhook or direct API call
 */
async function handleInvoiceNotification(req: NextRequest) {
  try {
    const payload = await req.json();
    const {
      invoiceId,
      customerId,
      amount,
      currency = 'USD',
      dueDate,
      channels = ['email'],
      includePdfAttachment = true,
      autoFollowUpDays = 7,
      paymentLinkExpiry = 30,
    } = payload;

    // Validate required fields
    if (!invoiceId || !customerId || !amount) {
      return NextResponse.json(
        { error: 'invoiceId, customerId, and amount are required' },
        { status: 400 }
      );
    }

    // Fetch invoice details from Stripe
    let invoiceData;
    try {
      invoiceData = await stripe.invoices.retrieve(invoiceId);
    } catch (stripeError) {
      console.error('Stripe retrieval error:', stripeError);
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    // Create notification record
    const { data: notification, error: dbError } = await supabase
      .from('invoice_notifications')
      .insert([
        {
          invoice_id: invoiceId,
          customer_id: customerId,
          amount: amount,
          currency: currency,
          due_date: dueDate || new Date(invoiceData.due_date * 1000).toISOString(),
          channels: channels,
          include_pdf: includePdfAttachment,
          auto_follow_up_days: autoFollowUpDays,
          status: 'pending',
          notification_sent: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to create notification record' },
        { status: 500 }
      );
    }

    // Prepare n8n payload
    const n8nPayload = {
      event: 'invoice.created',
      invoice_id: invoiceId,
      customer_id: customerId,
      amount: amount,
      currency: currency,
      due_date: dueDate,
      channels: channels,
      include_pdf_attachment: includePdfAttachment,
      auto_follow_up_days: autoFollowUpDays,
      payment_link_expiry: paymentLinkExpiry,
      notification_id: notification.id,
      stripe_hosted_url: invoiceData.hosted_invoice_url,
      stripe_pdf_url: invoiceData.invoice_pdf,
    };

    // Trigger n8n workflow asynchronously
    triggerN8nWorkflow(n8nPayload);

    return NextResponse.json(
      {
        success: true,
        message: 'Invoice notification initiated',
        notification_id: notification.id,
        invoice_id: invoiceId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in invoice notification handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get invoice notification status
 */
async function handleGetInvoiceStatus(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const invoiceId = searchParams.get('invoiceId');
    const customerId = searchParams.get('customerId');
    const notificationId = searchParams.get('notificationId');

    let query = supabase.from('invoice_notifications').select('*');

    if (notificationId) {
      query = query.eq('id', notificationId);
    } else if (invoiceId) {
      query = query.eq('invoice_id', invoiceId);
    } else if (customerId) {
      query = query.eq('customer_id', customerId);
    } else {
      return NextResponse.json(
        { error: 'invoiceId, customerId, or notificationId is required' },
        { status: 400 }
      );
    }

    const { data: notifications, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: notifications || [],
      count: notifications?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching notification status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Update notification status
 * Called when email is opened, link clicked, payment made
 */
async function handleUpdateNotificationStatus(req: NextRequest) {
  try {
    const payload = await req.json();
    const {
      notificationId,
      status,
      emailOpened,
      paymentLinkClicked,
      paymentReceived,
      paymentDate,
      paymentAmount,
    } = payload;

    if (!notificationId) {
      return NextResponse.json(
        { error: 'notificationId is required' },
        { status: 400 }
      );
    }

    // Update notification
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) updateData.status = status;
    if (emailOpened !== undefined) updateData.email_opened = emailOpened;
    if (paymentLinkClicked !== undefined) updateData.payment_link_clicked = paymentLinkClicked;
    if (paymentReceived !== undefined) updateData.payment_received = paymentReceived;
    if (paymentDate) updateData.payment_date = paymentDate;
    if (paymentAmount) updateData.payment_amount = paymentAmount;

    const { data: updated, error: updateError } = await supabase
      .from('invoice_notifications')
      .update(updateData)
      .eq('id', notificationId)
      .select()
      .single();

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update notification' },
        { status: 500 }
      );
    }

    // Log analytics event
    await logAnalytics({
      event_type: 'invoice_notification_updated',
      notification_id: notificationId,
      status: status,
      email_opened: emailOpened,
      payment_link_clicked: paymentLinkClicked,
      payment_received: paymentReceived,
    });

    // If payment received, cancel follow-up task via n8n
    if (paymentReceived && updated) {
      try {
        await fetch(`${N8N_BASE_URL}/webhook/invoice-payment-received`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.N8N_API_KEY}`,
          },
          body: JSON.stringify({
            invoice_id: updated.invoice_id,
            customer_id: updated.customer_id,
            notification_id: notificationId,
            payment_amount: paymentAmount,
            payment_date: paymentDate,
          }),
        });
      } catch (e) {
        console.error('Error sending payment received webhook:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Notification updated',
      data: updated,
    });
  } catch (error) {
    console.error('Error updating notification status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Trigger n8n workflow asynchronously
 */
async function triggerN8nWorkflow(payload: any) {
  try {
    fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.N8N_API_KEY}`,
      },
      body: JSON.stringify(payload),
    }).catch((error) => {
      console.error('n8n workflow trigger failed:', error);
    });
  } catch (error) {
    console.error('Error triggering n8n workflow:', error);
  }
}

/**
 * Log analytics event
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

/**
 * Handle Stripe webhook events
 * For invoice.created and invoice.sent events
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return handler(req);
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    if (event.type === 'invoice.created' || event.type === 'invoice.sent') {
      const invoice = event.data.object as any;

      const response = await handler(
        new NextRequest(req.url, {
          method: 'POST',
          body: JSON.stringify({
            invoiceId: invoice.id,
            customerId: invoice.customer,
            amount: invoice.amount_due / 100,
            currency: invoice.currency.toUpperCase(),
            dueDate: new Date(invoice.due_date * 1000).toISOString(),
            channels: ['email', 'sms'],
          }),
        })
      );

      return response;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook verification failed:', error);
    return NextResponse.json(
      { error: 'Webhook verification failed' },
      { status: 400 }
    );
  }
}

// Health check
export async function GET(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/health') {
    return NextResponse.json({ status: 'ok' });
  }
  return handler(req);
}
