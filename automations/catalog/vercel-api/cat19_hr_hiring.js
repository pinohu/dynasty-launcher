import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();

  try {
    switch (action) {
      case 'job-posting-syndication':
        return syndicateJobPosting(payload);
      case 'resume-screening':
        return screenResume(payload);
      case 'interview-scheduling':
        return scheduleInterview(payload);
      case 'rejection-notification':
        return sendRejectionNotification(payload);
      case 'new-hire-onboarding':
        return startOnboarding(payload);
      case 'document-collection':
        return collectDocuments(payload);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('HR error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function syndicateJobPosting(payload) {
  const { jobTitle, description, platforms, salary, location, businessId } = payload;

  const posting = {
    jobTitle,
    description,
    salary,
    location,
    postedAt: new Date().toISOString()
  };

  const results = {};

  for (const platform of platforms) {
    switch (platform) {
      case 'linkedin':
        results.linkedin = await postToLinkedIn(posting);
        break;
      case 'indeed':
        results.indeed = await postToIndeed(posting);
        break;
      case 'glassdoor':
        results.glassdoor = await postToGlassdoor(posting);
        break;
      case 'ziprecruiter':
        results.ziprecruiter = await postToZipRecruiter(posting);
        break;
    }
  }

  const db = await import('@vercel/postgres').then(m => m.sql);
  await db`
    INSERT INTO job_postings (business_id, job_title, description, salary, location, platforms_posted)
    VALUES (${businessId}, ${jobTitle}, ${description}, ${salary}, ${location}, ${JSON.stringify(platforms)})
  `;

  return NextResponse.json({ success: true, postingResults: results });
}

async function screenResume(payload) {
  const { resumeUrl, jobDescription, candidateEmail, jobId, businessId } = payload;

  const resumeResponse = await fetch(resumeUrl);
  const resumeText = await resumeResponse.text();

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyze this resume for the position: ${jobDescription}\n\nResume:\n${resumeText}\n\nProvide: match_score (0-100), key_strengths (array), gaps (array), recommendation (hire/maybe/reject), explanation.`
      }
    ]
  });

  const analysis = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');

  const db = await import('@vercel/postgres').then(m => m.sql);
  await db`
    INSERT INTO candidates (business_id, job_id, email, resume_url, match_score, recommendation)
    VALUES (${businessId}, ${jobId}, ${candidateEmail}, ${resumeUrl}, ${analysis.match_score}, ${analysis.recommendation})
  `;

  return NextResponse.json({
    success: true,
    candidateEmail,
    matchScore: analysis.match_score,
    recommendation: analysis.recommendation,
    strengths: analysis.key_strengths,
    gaps: analysis.gaps
  });
}

async function scheduleInterview(payload) {
  const { candidateId, candidateEmail, interviewerId, availableSlots, jobId, businessId } = payload;

  const selectedSlot = availableSlots[0];

  const db = await import('@vercel/postgres').then(m => m.sql);
  
  const interview = await db`
    INSERT INTO interviews (business_id, candidate_id, interviewer_id, job_id, scheduled_at, status)
    VALUES (${businessId}, ${candidateId}, ${interviewerId}, ${jobId}, ${selectedSlot}, 'scheduled')
    RETURNING id
  `;

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: candidateEmail,
      subject: 'Interview Scheduled',
      template: 'interview_scheduled',
      variables: { scheduledTime: selectedSlot, jobTitle: jobId }
    })
  });

  return NextResponse.json({
    success: true,
    interviewId: interview.rows[0].id,
    scheduledTime: selectedSlot,
    candidateEmail
  });
}

async function sendRejectionNotification(payload) {
  const { candidateEmail, candidateName, jobTitle, rejectionReason, businessId } = payload;

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: candidateEmail,
      subject: `Thank You for Applying to ${jobTitle}`,
      template: 'rejection_notification',
      variables: { candidateName, jobTitle, reason: rejectionReason }
    })
  });

  const db = await import('@vercel/postgres').then(m => m.sql);
  await db`
    UPDATE candidates 
    SET status = 'rejected'
    WHERE email = ${candidateEmail}
  `;

  return NextResponse.json({ success: true, candidateEmail });
}

async function startOnboarding(payload) {
  const { employeeId, email, startDate, position, department, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const checklist = [
    { task: 'IT Setup (Laptop, Email, Phone)', assigned_to: 'IT_DEPT', due_date: startDate },
    { task: 'Office Access & Keys', assigned_to: 'ADMIN', due_date: startDate },
    { task: 'Insurance & Benefits Enrollment', assigned_to: 'HR', due_date: new Date(new Date(startDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() },
    { task: 'Department Orientation', assigned_to: 'MANAGER', due_date: startDate },
    { task: 'Emergency Contacts Form', assigned_to: 'HR', due_date: startDate }
  ];

  const onboarding = await db`
    INSERT INTO onboarding (business_id, employee_id, start_date, status, checklist)
    VALUES (${businessId}, ${employeeId}, ${startDate}, 'in_progress', ${JSON.stringify(checklist)})
    RETURNING id
  `;

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: email,
      subject: `Welcome to the Team! - Starting ${startDate}`,
      template: 'welcome_new_hire',
      variables: { position, department, startDate }
    })
  });

  return NextResponse.json({
    success: true,
    onboardingId: onboarding.rows[0].id,
    checklist
  });
}

async function collectDocuments(payload) {
  const { employeeId, email, documents, businessId } = payload;

  const db = await import('@vercel/postgres').then(m => m.sql);

  const documentRequest = await db`
    INSERT INTO document_requests (business_id, employee_id, documents_needed, status)
    VALUES (${businessId}, ${employeeId}, ${JSON.stringify(documents)}, 'pending')
    RETURNING id
  `;

  const documentList = documents.join(', ');

  await fetch('https://api.acumbamail.com/v1/email/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: email,
      subject: 'Please Submit Required Documents',
      template: 'document_collection_request',
      variables: { documents: documentList, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }
    })
  });

  return NextResponse.json({
    success: true,
    requestId: documentRequest.rows[0].id,
    documentsRequested: documents
  });
}

async function postToLinkedIn(posting) {
  return { status: 'posted', jobTitle: posting.jobTitle };
}

async function postToIndeed(posting) {
  return { status: 'posted', jobTitle: posting.jobTitle };
}

async function postToGlassdoor(posting) {
  return { status: 'posted', jobTitle: posting.jobTitle };
}

async function postToZipRecruiter(posting) {
  return { status: 'posted', jobTitle: posting.jobTitle };
}
