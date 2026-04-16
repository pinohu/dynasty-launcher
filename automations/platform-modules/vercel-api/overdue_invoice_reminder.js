/**
 * Overdue Invoice Reminder API
 * Vercel serverless function for managing overdue invoice reminders
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
const N8N_CRON_WEBHOOK = `${N8N_BASE_URL}/webhook/overdue-invoice-reminder`;

export default async function handler(req: NextRequest) {
  if (req.method === 'POST') {
    return handleReminderTrigger(req);
  } else if (req.method === 'GET') {
    return handleGetReminderStatus(req);
  } else if (req.method === 'PATCH') {
    return handleUpdateReminderStatus(req);
  } else if (req.method === 'DELETE') {
    return handlePauseReminders(req);
  }
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * Daily cron trigger - finds and processes overdue invoices
 */
async function handleReminderTrigger(req: NextRequest) {
  try {
    const payload = await req.json();
    const {
      testMode = false,
      invoiceId,
      customerId,
      reminderScheduleDays = [1, 7, 14, 30],
      applyLateFee = false,
      lateFeeAmount = '2%',
    } = payload;

    let overdue = [];

    if (invoiceId) {
      // Single invoice check
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();
      if (invoice) overdue.push(invoice);
    } else {
      // Get all unpaid, overdue invoices
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - 1);

      const { data: invoices } = await supabase
        .from('invoices')
        .select('*')
        .eq('status', 'unpaid')
        .lt('due_date', dueDate.toISOString());

      overdue = invoices || [];
    }

    const results = [];

    for (const invoice of overdue) {
      const reminderResult = await processOverdueInvoice(
        invoice,
        reminderScheduleDays,
        applyLateFee,
        lateFeeAmount,
        testMode
      );
      results.push(reminderResult);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} overdue invoices`,
      processed: results.length,
      results: results,
    });
  } catch (error) {
    console.error('Error in reminder trigger:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process a single overdue invoice
 */
async function processOverdueInvoice(
  invoice: any,
  reminderScheduleDays: number[],
  applyLateFee: boolean,
  lateFeeAmount: string,
  testMode: boolean = false
) {
  try {
    const daysOverdue = calculateDaysOverdue(invoice.due_date);

    // Check which reminder stage to send
    let reminderStage = null;
    for (const day of reminderScheduleDays) {
      if (daysOverdue === day) {
        reminderStage = reminderScheduleDays.indexOf(day) + 1;
        break;
      }
    }

    if (!reminderStage) {
      return {
        invoice_id: invoice.id,
        status: 'skipped',
        reason: 'Not on scheduled reminder day',
      };
    }

    // Check if max reminders exceeded
    const { data: reminderCount } = await supabase
      .from('overdue_reminders')
      .select('id', { count: 'exact' })
      .eq('invoice_id', invoice.id)
      .eq('status', 'sent');

    if (reminderCount && reminderCount.length >= 4) {
      return {
        invoice_id: invoice.id,
        status: 'skipped',
        reason: 'Max reminders reached',
      };
    }

    // Get customer data
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', invoice.customer_id)
      .single();

    if (!customer) {
      return {
        invoice_id: invoice.id,
        status: 'error',
        reason: 'Customer not found',
      };
    }

    // Apply late fee if configured
    let updatedAmount = invoice.amount_remaining;
    if (applyLateFee) {
      const fee = calculateLateFee(invoice.amount_remaining, lateFeeAmount);
      updatedAmount = invoice.amount_remaining + fee;

      await supabase
        .from('invoices')
        .update({
          late_fee: fee,
          amount_remaining: updatedAmount,
        })
        .eq('id', invoice.id);
    }

    // Create reminder record
    const { data: reminder } = await supabase
      .from('overdue_reminders')
      .insert([
        {
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          stage: reminderStage,
          days_overdue: daysOverdue,
          amount_due: updatedAmount,
          status: 'scheduled',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    // Trigger n8n workflow for actual sending
    const n8nPayload = {
      invoice_id: invoice.id,
      customer_id: invoice.customer_id,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      invoice_number: invoice.number,
      amount: updatedAmount,
      currency: invoice.currency,
      due_date: new Date(invoice.due_date).toLocaleDateString(),
      days_overdue: daysOverdue,
      stage: reminderStage,
      reminder_id: reminder?.id,
      late_fee_applied: applyLateFee,
      test_mode: testMode,
      owner_email: process.env.OWNER_EMAIL,
    };

    // Trigger n8n async
    triggerN8nWorkflow(n8nPayload);

    return {
      invoice_id: invoice.id,
      customer_id: invoice.customer_id,
      status: 'sent',
      stage: reminderStage,
      days_overdue: daysOverdue,
      reminder_id: reminder?.id,
    };
  } catch (error) {
    console.error('Error processing overdue invoice:', error);
    return {
      invoice_id: invoice.id,
      status: 'error',
      error: String(error),
    };
  }
}

/**
 * Get reminder history and status
 */
async function handleGetReminderStatus(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const invoiceId = searchParams.get('invoiceId');
    const customerId = searchParams.get('customerId');
    const reminderId = searchParams.get('reminderId');

    let query = supabase.from('overdue_reminders').select('*');

    if (reminderId) {
      query = query.eq('id', reminderId);
    } else if (invoiceId) {
      query = query.eq('invoice_id', invoiceId);
    } else if (customerId) {
      query = query.eq('customer_id', customerId);
    } else {
      return NextResponse.json(
        { error: 'invoiceId, customerId, or reminderId required' },
        { status: 400 }
      );
    }

    const { data: reminders, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch reminders' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: reminders || [],
      count: reminders?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching reminder status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Update reminder status
 * Called when reminder sent, payment made, or escalation needed
 */
async function handleUpdateReminderStatus(req: NextRequest) {
  try {
    const payload = await req.json();
    const {
      reminderId,
      status,
      sentAt,
      emailDelivered,
      smsDelivered,
      paymentReceived,
      paymentAmount,
      escalatedToCollections,
    } = payload;

    if (!reminderId) {
      return NextResponse.json(
        { error: 'reminderId is required' },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) updateData.status = status;
    if (sentAt) updateData.sent_at = sentAt;
    if (emailDelivered !== undefined) updateData.email_delivered = emailDelivered;
    if (smsDelivered !== undefined) updateData.sms_delivered = smsDelivered;
    if (paymentReceived !== undefined) updateData.payment_received = paymentReceived;
    if (paymentAmount) updateData.payment_amount = paymentAmount;
    if (escalatedToCollections !== undefined) {
      updateData.escalated_to_collections = escalatedToCollections;
    }

    const { data: updated, error: updateError } = await supabase
      .from('overdue_reminders')
      .update(updateData)
      .eq('id', reminderId)
      .select()
      .single();

    if (updateError) {
      console.error('Database update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update reminder' },
        { status: 500 }
      );
    }

    // If payment received, update invoice and mark paid
    if (paymentReceived && paymentAmount && updated) {
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString(),
          amount_remaining: Math.max(0, (updated.amount_due || 0) - paymentAmount),
        })
        .eq('id', updated.invoice_id);

      // Log event
      await logAnalytics({
        event_type: 'overdue_reminder_payment_received',
        reminder_id: reminderId,
        invoice_id: updated.invoice_id,
        payment_amount: paymentAmount,
      });
    }

    // Log analytics
    await logAnalytics({
      event_type: 'overdue_reminder_updated',
      reminder_id: reminderId,
      status: status,
      email_delivered: emailDelivered,
      payment_received: paymentReceived,
    });

    return NextResponse.json({
      success: true,
      message: 'Reminder updated',
      data: updated,
    });
  } catch (error) {
    console.error('Error updating reminder status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Pause reminders for an invoice
 * Called when partial payment is made
 */
async function handlePauseReminders(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const invoiceId = searchParams.get('invoiceId');

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'invoiceId is required' },
        { status: 400 }
      );
    }

    const { data: paused, error } = await supabase
      .from('overdue_reminders')
      .update({ status: 'paused' })
      .eq('invoice_id', invoiceId)
      .eq('status', 'scheduled');

    if (error) {
      return NextResponse.json(
        { error: 'Failed to pause reminders' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Reminders paused',
      paused_count: paused?.length || 0,
    });
  } catch (error) {
    console.error('Error pausing reminders:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Helper: Calculate days overdue
 */
function calculateDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = now.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Helper: Calculate late fee
 */
function calculateLateFee(amount: number, feeConfig: string): number {
  if (feeConfig.includes('%')) {
    const percent = parseFloat(feeConfig) / 100;
    return Math.round(amount * percent * 100) / 100;
  } else {
    return parseFloat(feeConfig);
  }
}

/**
 * Trigger n8n workflow asynchronously
 */
async function triggerN8nWorkflow(payload: any) {
  try {
    fetch(N8N_CRON_WEBHOOK, {
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

// Health check
export async function GET(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/health') {
    return NextResponse.json({ status: 'ok' });
  }
  return handler(req);
}
