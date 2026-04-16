import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { sendSMS } from '../integrations/sms-it.js';

const router = Router();

// 1. SMS Appointment Reminders
router.post('/appointment-reminder', async (req, res) => {
  try {
    const { appointmentId, phone } = req.body;
    logger.info('Sending appointment reminder', { appointmentId, phone });

    const appointmentResult = await pool.query(
      'SELECT appointment_time, service_type, location FROM appointments WHERE id = $1',
      [appointmentId]
    );

    if (appointmentResult.rows.length === 0) throw new Error('Appointment not found');
    const appointment = appointmentResult.rows[0];

    const appointmentTime = new Date(appointment.appointment_time).toLocaleString();
    const message = `Reminder: Your ${appointment.service_type} appointment is scheduled for ${appointmentTime} at ${appointment.location}. Reply CONFIRM to confirm or CANCEL to reschedule.`;

    await sendSMS(phone, message);

    // Log reminder sent
    const logResult = await pool.query(
      'INSERT INTO sms_reminders (appointment_id, phone, sent_at) VALUES ($1, $2, NOW()) RETURNING id',
      [appointmentId, phone]
    );

    res.json({
      success: true,
      reminderId: logResult.rows[0].id,
      message: 'Reminder sent successfully'
    });
  } catch (error) {
    logger.error('Reminder error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Two-way SMS Conversation Logging
router.post('/log-conversation', async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    logger.info('Logging SMS conversation', { conversationId });

    const result = await pool.query(
      'INSERT INTO sms_conversations (conversation_id, message, logged_at) VALUES ($1, $2, NOW()) RETURNING id',
      [conversationId, message]
    );

    // Extract contact from conversation and update CRM
    const convResult = await pool.query(
      'SELECT contact_id FROM sms_conversations WHERE conversation_id = $1 LIMIT 1',
      [conversationId]
    );

    if (convResult.rows.length > 0) {
      await pool.query(
        'INSERT INTO contact_activities (contact_id, activity_type, description) VALUES ($1, $2, $3)',
        [convResult.rows[0].contact_id, 'SMS', message]
      );
    }

    res.json({
      success: true,
      logId: result.rows[0].id,
      message: 'Conversation logged to CRM'
    });
  } catch (error) {
    logger.error('Conversation logging error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. After-Hours Auto-Reply
router.post('/after-hours-reply', async (req, res) => {
  try {
    const { phone, channel } = req.body;
    logger.info('Sending after-hours auto-reply', { phone, channel });

    const businessHoursResult = await pool.query(
      'SELECT open_time, close_time FROM business_hours WHERE day_of_week = EXTRACT(DOW FROM NOW())'
    );

    const now = new Date();
    const currentHour = now.getHours();
    const isAfterHours = currentHour < 8 || currentHour > 18;

    if (isAfterHours) {
      const message = 'Thank you for reaching out! We are currently closed. Our team will respond during business hours (8 AM - 6 PM). For emergencies, please call our 24-hour support line.';
      
      if (channel === 'sms') {
        await sendSMS(phone, message);
      }

      const logResult = await pool.query(
        'INSERT INTO auto_replies (phone, channel, message, sent_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
        [phone, channel, message]
      );

      return res.json({
        success: true,
        replyId: logResult.rows[0].id,
        message: 'Auto-reply sent'
      });
    }

    res.json({
      success: true,
      message: 'Within business hours - no auto-reply sent'
    });
  } catch (error) {
    logger.error('After-hours reply error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Chat-to-Ticket Conversion
router.post('/chat-to-ticket', async (req, res) => {
  try {
    const { chatSessionId, message } = req.body;
    logger.info('Converting chat to ticket', { chatSessionId });

    const chatResult = await pool.query(
      'SELECT contact_id, chat_transcript FROM chat_sessions WHERE id = $1',
      [chatSessionId]
    );

    if (chatResult.rows.length === 0) throw new Error('Chat session not found');
    const chat = chatResult.rows[0];

    // Create support ticket
    const ticketResult = await pool.query(
      'INSERT INTO support_tickets (contact_id, subject, description, status, priority, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id',
      [
        chat.contact_id,
        `Support Ticket from Chat: ${message.substring(0, 50)}`,
        chat.chat_transcript,
        'open',
        'normal'
      ]
    );

    // Close chat session
    await pool.query(
      'UPDATE chat_sessions SET status = $1, ticket_id = $2 WHERE id = $3',
      ['converted', ticketResult.rows[0].id, chatSessionId]
    );

    res.json({
      success: true,
      ticketId: ticketResult.rows[0].id,
      message: 'Chat converted to support ticket'
    });
  } catch (error) {
    logger.error('Chat-to-ticket error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. FAQ Chatbot Handler
router.post('/faq-chatbot', async (req, res) => {
  try {
    const { chatId, userMessage } = req.body;
    logger.info('FAQ chatbot query', { chatId, userMessage });

    // Simple keyword matching for FAQs
    const faqResult = await pool.query(
      'SELECT answer FROM faqs WHERE question ILIKE $1 LIMIT 1',
      [`%${userMessage}%`]
    );

    let response = '';
    if (faqResult.rows.length > 0) {
      response = faqResult.rows[0].answer;
    } else {
      response = 'I did not find an answer to your question. Please hold while connecting you with a support agent.';
    }

    // Log chat interaction
    const logResult = await pool.query(
      'INSERT INTO chat_interactions (chat_id, user_message, bot_response, responded_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [chatId, userMessage, response]
    );

    // If FAQ not found, escalate to human agent
    if (faqResult.rows.length === 0) {
      await pool.query(
        'UPDATE chat_sessions SET needs_escalation = true WHERE id = $1',
        [chatId]
      );
    }

    res.json({
      success: true,
      interactionId: logResult.rows[0].id,
      response,
      escalated: faqResult.rows.length === 0
    });
  } catch (error) {
    logger.error('FAQ chatbot error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Bulk SMS Campaign Manager
router.post('/bulk-campaign', async (req, res) => {
  try {
    const { campaignId, message } = req.body;
    logger.info('Bulk SMS campaign', { campaignId });

    // Get all contacts in campaign with opt-in
    const contactsResult = await pool.query(
      'SELECT id, phone, first_name FROM contacts WHERE campaign_id = $1 AND sms_opt_in = true AND suppressed = false',
      [campaignId]
    );

    if (contactsResult.rows.length === 0) {
      return res.json({
        success: true,
        sentCount: 0,
        message: 'No eligible contacts for campaign'
      });
    }

    // Send SMS with throttling (respect rate limits)
    let sentCount = 0;
    const failedContacts = [];

    for (const contact of contactsResult.rows) {
      try {
        const personalizedMessage = message.replace('{name}', contact.first_name);
        await sendSMS(contact.phone, personalizedMessage);
        sentCount++;
        
        // Log campaign send
        await pool.query(
          'INSERT INTO campaign_sends (campaign_id, contact_id, sent_at) VALUES ($1, $2, NOW())',
          [campaignId, contact.id]
        );

        // Throttle: 100ms between sends
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.warn('SMS send failed for contact', { contactId: contact.id, error: error.message });
        failedContacts.push(contact.id);
      }
    }

    // Log campaign completion
    await pool.query(
      'UPDATE sms_campaigns SET sent_count = $1, failed_count = $2, completed_at = NOW() WHERE id = $3',
      [sentCount, failedContacts.length, campaignId]
    );

    res.json({
      success: true,
      campaignId,
      sentCount,
      failedCount: failedContacts.length,
      message: `Campaign sent to ${sentCount} contacts`
    });
  } catch (error) {
    logger.error('Bulk campaign error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
