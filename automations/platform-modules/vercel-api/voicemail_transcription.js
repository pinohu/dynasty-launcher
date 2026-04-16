import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';
import OpenAI from 'openai';
import axios from 'axios';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/webhook', async (req, res) => {
  try {
    const { voicemail, caller, business, owner } = req.body;
    
    if (!voicemail || !voicemail.audio_url) {
      return res.status(400).json({ error: 'Missing voicemail audio URL' });
    }

    // 1. Download and transcribe audio
    const audioBuffer = await axios.get(voicemail.audio_url, { responseType: 'arraybuffer' });
    
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: new Blob([audioBuffer.data], { type: 'audio/wav' }),
      model: 'whisper-1',
      language: 'en',
    });

    const transcription = transcriptionResponse.text;

    // 2. Analyze intent with GPT-4
    const analysisResponse = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a voicemail analysis expert. Extract intent, urgency, and service type from voicemails. Respond in JSON format.',
        },
        {
          role: 'user',
          content: `Analyze this voicemail: "${transcription}"\n\nReturn JSON: {intent: "SCHEDULING|SUPPORT|PAYMENT|COMPLAINT|INQUIRY|OTHER", urgency: "LOW|MEDIUM|HIGH|CRITICAL", serviceType: "HVAC|PLUMBING|ELECTRICAL|CLEANING|OTHER"}`,
        },
      ],
    });

    const analysis = JSON.parse(analysisResponse.choices[0].message.content);

    // 3. Create lead or task based on intent
    let leadId, taskId;

    if (['SCHEDULING', 'INQUIRY'].includes(analysis.intent)) {
      const lead = await prisma.lead.create({
        data: {
          businessId: business.id,
          name: caller.name,
          phone: caller.phone,
          email: caller.email,
          serviceRequested: analysis.serviceType,
          source: 'VOICEMAIL',
          priority: analysis.urgency,
          metadata: { transcription, voicemailUrl: voicemail.audio_url },
        },
      });
      leadId = lead.id;
    } else if (['SUPPORT', 'COMPLAINT', 'PAYMENT'].includes(analysis.intent)) {
      const task = await prisma.crmTask.create({
        data: {
          businessId: business.id,
          title: `Follow up: ${analysis.intent} from ${caller.name}`,
          description: transcription,
          priority: analysis.urgency,
          tags: [`voicemail_${analysis.intent.toLowerCase()}`, analysis.serviceType.toLowerCase()],
          metadata: { voicemailUrl: voicemail.audio_url, transcription },
        },
      });
      taskId = task.id;
    }

    // 4. Send owner notification
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(),
        payload: {
          to: owner.email,
          subject: `Voicemail: ${caller.name} - ${analysis.intent}`,
          template: 'voicemail_transcription_summary',
          variables: {
            caller,
            transcription,
            intent: analysis.intent,
            urgency: analysis.urgency,
            serviceType: analysis.serviceType,
            voicemailUrl: voicemail.audio_url,
          },
        },
      },
    });

    // 5. Tag by service type
    if (leadId) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { tags: [analysis.serviceType] },
      });
    }

    await logAction('voicemail_transcription', {
      businessId: business.id,
      transcribed: true,
      intent: analysis.intent,
      urgency: analysis.urgency,
      serviceType: analysis.serviceType,
      leadCreated: !!leadId,
      taskCreated: !!taskId,
    });

    res.json({
      success: true,
      transcription,
      analysis,
      leadId,
      taskId,
    });
  } catch (error) {
    console.error('Voicemail transcription error:', error);
    res.status(500).json({ error: 'Failed to transcribe voicemail' });
  }
});

export default router;
