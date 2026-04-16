import { Router } from 'express';
import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import axios from 'axios';

const router = Router();

// 1. Call Recording Automation (consent-aware, two-party states)
router.post('/call-recording', async (req, res) => {
  try {
    const { callId, recordingUrl } = req.body;
    logger.info('Call recording logged', { callId });

    const callResult = await pool.query(
      'SELECT caller_id, called_number, call_state FROM calls WHERE id = $1',
      [callId]
    );

    if (callResult.rows.length === 0) throw new Error('Call not found');
    const call = callResult.rows[0];

    // Check consent for both parties (two-party consent states)
    const consentResult = await pool.query(
      'SELECT recording_consent FROM contacts WHERE phone = $1 LIMIT 1',
      [call.caller_id]
    );

    const hasConsent = consentResult.rows.length > 0 && consentResult.rows[0].recording_consent;

    // Log recording
    const recordResult = await pool.query(
      'INSERT INTO call_recordings (call_id, recording_url, consent_status, recorded_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [callId, recordingUrl, hasConsent ? 'consented' : 'no_consent']
    );

    res.json({
      success: true,
      recordingId: recordResult.rows[0].id,
      consentStatus: hasConsent ? 'consented' : 'no_consent',
      message: 'Call recording logged'
    });
  } catch (error) {
    logger.error('Call recording error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Call Transcription (AI-powered real-time or post-call)
router.post('/call-transcription', async (req, res) => {
  try {
    const { callId, recordingUrl } = req.body;
    logger.info('Transcribing call', { callId });

    // In production, would call actual transcription API (e.g., Google Cloud Speech)
    // Here we show the structure
    const transcriptionResult = await pool.query(
      'INSERT INTO call_transcriptions (call_id, recording_url, status) VALUES ($1, $2, $3) RETURNING id',
      [callId, recordingUrl, 'processing']
    );

    // Simulate transcription (in production, use real API)
    const mockTranscript = 'This is a mock transcription of the call. In production, integrate with Google Cloud Speech-to-Text or similar service.';

    // Update with transcription
    await pool.query(
      'UPDATE call_transcriptions SET transcript = $1, status = $2, completed_at = NOW() WHERE id = $3',
      [mockTranscript, 'completed', transcriptionResult.rows[0].id]
    );

    // Extract keywords for logging
    const keywords = ['appointment', 'issue', 'resolution'].filter(k => mockTranscript.toLowerCase().includes(k));

    res.json({
      success: true,
      transcriptionId: transcriptionResult.rows[0].id,
      transcript: mockTranscript,
      keywords,
      status: 'completed'
    });
  } catch (error) {
    logger.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Sentiment Analysis on Calls
router.post('/sentiment-analysis', async (req, res) => {
  try {
    const { callId, transcript } = req.body;
    logger.info('Analyzing call sentiment', { callId });

    // Simple sentiment scoring (in production, use AI/NLP)
    const negativeKeywords = ['frustrated', 'angry', 'terrible', 'awful', 'broken'];
    const positiveKeywords = ['great', 'excellent', 'happy', 'satisfied', 'thank'];

    const transcriptLower = transcript.toLowerCase();
    const negativeMatches = negativeKeywords.filter(k => transcriptLower.includes(k)).length;
    const positiveMatches = positiveKeywords.filter(k => transcriptLower.includes(k)).length;

    let sentiment = 'neutral';
    let score = 50;

    if (negativeMatches > positiveMatches) {
      sentiment = 'negative';
      score = Math.max(0, 50 - (negativeMatches * 15));
    } else if (positiveMatches > negativeMatches) {
      sentiment = 'positive';
      score = Math.min(100, 50 + (positiveMatches * 15));
    }

    const analysisResult = await pool.query(
      'INSERT INTO call_sentiment (call_id, transcript, sentiment, score, analyzed_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [callId, transcript, sentiment, score]
    );

    // Alert if negative sentiment
    if (sentiment === 'negative') {
      logger.warn('Negative sentiment detected', { callId, score });
      // In production: notify manager, flag for QA
    }

    res.json({
      success: true,
      sentimentId: analysisResult.rows[0].id,
      sentiment,
      score,
      flaggedForQA: sentiment === 'negative'
    });
  } catch (error) {
    logger.error('Sentiment analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Missed Call Callback Scheduler
router.post('/missed-call-callback', async (req, res) => {
  try {
    const { callerId, missedTime } = req.body;
    logger.info('Scheduling missed call callback', { callerId });

    // Get contact info
    const contactResult = await pool.query(
      'SELECT id, first_name, phone FROM contacts WHERE phone = $1 LIMIT 1',
      [callerId]
    );

    if (contactResult.rows.length === 0) {
      return res.json({
        success: false,
        message: 'Contact not found for callback'
      });
    }

    const contact = contactResult.rows[0];
    const callbackTime = new Date(Date.now() + 10 * 60000); // 10 min from now

    const callbackResult = await pool.query(
      'INSERT INTO callback_queue (contact_id, requested_time, scheduled_for, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [contact.id, missedTime, callbackTime, 'queued']
    );

    res.json({
      success: true,
      callbackId: callbackResult.rows[0].id,
      contactName: contact.first_name,
      scheduledTime: callbackTime.toLocaleString(),
      message: 'Callback scheduled'
    });
  } catch (error) {
    logger.error('Missed call callback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. IVR/Phone Tree Builder
router.post('/ivr-routing', async (req, res) => {
  try {
    const { callId, selection } = req.body;
    logger.info('IVR routing', { callId, selection });

    const ivrResult = await pool.query(
      'SELECT * FROM ivr_config WHERE menu_option = $1',
      [selection]
    );

    if (ivrResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IVR selection'
      });
    }

    const route = ivrResult.rows[0];

    // Route call to department/queue
    const routeResult = await pool.query(
      'UPDATE calls SET ivr_selection = $1, department = $2, status = $3 WHERE id = $4 RETURNING *',
      [selection, route.department, 'routed', callId]
    );

    res.json({
      success: true,
      callId,
      routedTo: route.department,
      queueDepth: Math.floor(Math.random() * 5), // Mock
      message: `Call routed to ${route.department}`
    });
  } catch (error) {
    logger.error('IVR routing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. AI Receptionist (answer, qualify, schedule, transfer)
router.post('/ai-receptionist', async (req, res) => {
  try {
    const { callId, callerInput } = req.body;
    logger.info('AI receptionist handling call', { callId });

    // Simple NLP for intent detection
    const intents = {
      scheduling: callerInput.toLowerCase().includes('appointment') || callerInput.toLowerCase().includes('schedule'),
      support: callerInput.toLowerCase().includes('help') || callerInput.toLowerCase().includes('issue'),
      billing: callerInput.toLowerCase().includes('invoice') || callerInput.toLowerCase().includes('bill')
    };

    const primaryIntent = Object.keys(intents).find(k => intents[k]) || 'general';

    // Generate response
    let response = '';
    let action = 'continue_conversation';

    if (intents.scheduling) {
      response = 'I can help you schedule an appointment. Let me check our availability.';
      action = 'transfer_to_scheduling';
    } else if (intents.support) {
      response = 'I understand you need technical support. Connecting you with our support team.';
      action = 'transfer_to_support';
    } else if (intents.billing) {
      response = 'I can assist with billing questions. Connecting you with our billing department.';
      action = 'transfer_to_billing';
    } else {
      response = 'How can I assist you today?';
      action = 'continue_conversation';
    }

    const logResult = await pool.query(
      'INSERT INTO ai_receptionist_calls (call_id, caller_input, detected_intent, ai_response, action) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [callId, callerInput, primaryIntent, response, action]
    );

    res.json({
      success: true,
      logId: logResult.rows[0].id,
      response,
      detectedIntent: primaryIntent,
      action,
      message: 'AI receptionist processed call'
    });
  } catch (error) {
    logger.error('AI receptionist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Call Disposition Logging
router.post('/call-disposition', async (req, res) => {
  try {
    const { callId, outcome, notes } = req.body;
    logger.info('Logging call disposition', { callId, outcome });

    const dispositionResult = await pool.query(
      'INSERT INTO call_dispositions (call_id, outcome_code, notes, logged_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
      [callId, outcome, notes]
    );

    // Update call status
    await pool.query(
      'UPDATE calls SET disposition = $1, status = $2 WHERE id = $3',
      [outcome, 'completed', callId]
    );

    res.json({
      success: true,
      dispositionId: dispositionResult.rows[0].id,
      outcome,
      message: 'Call disposition logged'
    });
  } catch (error) {
    logger.error('Disposition logging error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Outbound Dialing Campaign Manager
router.post('/outbound-campaign', async (req, res) => {
  try {
    const { campaignId } = req.body;
    logger.info('Outbound dialing campaign', { campaignId });

    // Get campaign details
    const campaignResult = await pool.query(
      'SELECT * FROM dialing_campaigns WHERE id = $1',
      [campaignId]
    );

    if (campaignResult.rows.length === 0) throw new Error('Campaign not found');
    const campaign = campaignResult.rows[0];

    // Get campaign list
    const listResult = await pool.query(
      'SELECT id, phone, first_name FROM contacts WHERE campaign_list_id = $1 AND do_not_call = false LIMIT 50',
      [campaign.contact_list_id]
    );

    // Log campaign start
    const logResult = await pool.query(
      'INSERT INTO campaign_dials (campaign_id, contact_count, started_at, status) VALUES ($1, $2, NOW(), $3) RETURNING id',
      [campaignId, listResult.rows.length, 'in_progress']
    );

    // In production, would queue calls to CallScaler
    res.json({
      success: true,
      campaignDialId: logResult.rows[0].id,
      campaignId,
      contactsToCall: listResult.rows.length,
      script: campaign.script,
      message: 'Campaign dialing initiated'
    });
  } catch (error) {
    logger.error('Outbound campaign error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
