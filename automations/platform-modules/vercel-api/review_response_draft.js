import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import { prisma } from '../lib/prisma';
import OpenAI from 'openai';

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/webhook', async (req, res) => {
  try {
    const { review, business, owner, service } = req.body;
    
    if (!review || !review.platform) {
      return res.status(400).json({ error: 'Invalid review data' });
    }

    // 1. Generate response with GPT-4
    const responseCompletion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a professional business owner writing responses to customer reviews. Be empathetic, professional, and offer solutions.',
        },
        {
          role: 'user',
          content: `Write a response to this ${review.rating}-star review on ${review.platform}. Review: "${review.text}". Keep it under 300 characters. Business: ${business.name}`,
        },
      ],
      max_tokens: 150,
    });

    const draftResponse = responseCompletion.choices[0].message.content;

    // 2. Save draft for approval
    const reviewRecord = await prisma.review.create({
      data: {
        businessId: business.id,
        platform: review.platform,
        author: review.author,
        rating: review.rating,
        text: review.text,
        externalUrl: review.url,
        draftResponse,
        status: 'AWAITING_APPROVAL',
        detectedAt: new Date(),
      },
    });

    // 3. Send approval email to owner
    await prisma.queue.create({
      data: {
        type: 'EMAIL',
        businessId: business.id,
        scheduledFor: new Date(),
        payload: {
          to: owner.email,
          subject: `Review Response Needed: ${review.platform} - ${review.rating}★`,
          template: 'review_response_draft_approval',
          variables: {
            review,
            draftResponse,
            business,
          },
        },
      },
    });

    // 4. Schedule auto-post if not approved within 48h
    await prisma.queue.create({
      data: {
        type: 'TASK',
        businessId: business.id,
        scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000),
        payload: {
          action: 'auto_post_review_response',
          reviewId: reviewRecord.id,
        },
      },
    });

    await logAction('review_response_draft', {
      businessId: business.id,
      reviewId: reviewRecord.id,
      platform: review.platform,
      rating: review.rating,
      draftGenerated: true,
    });

    res.json({
      success: true,
      reviewId: reviewRecord.id,
      draftResponse,
      approvalRequired: true,
    });
  } catch (error) {
    console.error('Review response draft error:', error);
    res.status(500).json({ error: 'Failed to generate response draft' });
  }
});

router.post('/:reviewId/post-response', authenticateToken, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { responseText, platform } = req.body;

    const review = await prisma.review.update({
      where: { id: reviewId },
      data: {
        postedResponse: responseText,
        status: 'POSTED',
        postedAt: new Date(),
      },
    });

    // Post to actual platform (would integrate with platform API)
    // This is a placeholder

    await logAction('review_response_posted', {
      reviewId,
      platform,
      responsePosted: true,
    });

    res.json({
      success: true,
      message: 'Review response posted',
    });
  } catch (error) {
    console.error('Post response error:', error);
    res.status(500).json({ error: 'Failed to post response' });
  }
});

export default router;
