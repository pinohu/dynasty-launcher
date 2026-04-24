// api/automation-catalog.js — 353 n8n workflow catalog + generator (45 categories); 347 is the separate strategy micro-task layer in docs — not the same count.
// Dynasty Empire LLC — Service Business Automation Platform
// Each automation: { id, cat, name, trigger, cron?, steps[] }
// Steps shorthand: { t: type, ...params } expanded by buildN8nWorkflow()

const CATEGORIES = {
  1: 'Lead Generation & Prospecting',
  2: 'Lead Capture & Intake',
  3: 'Lead Qualification & Scoring',
  4: 'CRM & Contact Management',
  5: 'Sales Pipeline & Follow-Up',
  6: 'Proposals, Estimates & Quoting',
  7: 'Contracts & Agreements',
  8: 'Client Onboarding',
  9: 'Scheduling & Appointments',
  10: 'Project & Task Management',
  11: 'Service Delivery & Fulfillment',
  12: 'Communication — Email',
  13: 'Communication — SMS & Chat',
  14: 'Communication — Voice & Phone',
  15: 'Invoicing & Billing',
  16: 'Payment Processing & Collections',
  17: 'Bookkeeping & Accounting',
  18: 'Payroll & Team Management',
  19: 'HR & Hiring',
  20: 'Compliance & Legal',
  21: 'Reputation & Reviews',
  22: 'Customer Support & Help Desk',
  23: 'Reporting & Analytics',
  24: 'Marketing — Content',
  25: 'Marketing — Social',
  26: 'Marketing — SEO',
  27: 'Marketing — Paid Ads',
  28: 'Marketing — Email Campaigns',
  29: 'Referral & Affiliate',
  30: 'Upselling & Cross-Selling',
  31: 'Client Retention & Renewals',
  32: 'Client Offboarding & Churn',
  33: 'Vendor & Supplier Management',
  34: 'Inventory, Equipment & Assets',
  35: 'Document Management',
  36: 'Knowledge Base & Training',
  37: 'Quality Assurance & Auditing',
  38: 'Field Service & Dispatch',
  39: 'Client Portal & Self-Service',
  40: 'Data Enrichment & Intelligence',
  41: 'Security & Access Control',
  42: 'Website & Landing Ops',
  43: 'Business Formation & Entity',
  44: 'Insurance & Risk',
  45: 'AI Agent & Workflow Orchestration',
};

// Automation package groupings for tier-based deployment
const PACKAGES = {
  core: [
    '2.01','2.02','2.03','2.12','2.15',
    '3.01','3.07',
    '5.01','5.02','5.03',
    '8.01','8.02','8.05',
    '9.01','9.02','9.03','9.04',
    '12.01','12.03',
    '13.01','13.03',
    '14.04',
    '15.01','15.05','15.08',
    '16.01','16.02','16.03',
    '21.01','21.02','21.03',
    '28.01',
    '45.01','45.07',
  ],
  sales: [
    '1.01','1.06','1.13','1.14','1.20',
    '2.04','2.05','2.06','2.10','2.11',
    '3.02','3.03','3.04','3.05','3.06','3.08','3.09','3.10',
    '4.01','4.02','4.04','4.05','4.09','4.10',
    '5.04','5.05','5.06','5.07','5.08','5.09','5.10',
    '6.01','6.02','6.03','6.04','6.05','6.06','6.07','6.08',
    '7.01','7.02','7.03','7.04','7.05','7.06','7.07',
    '29.01','29.02','29.03','29.04','29.05',
    '30.01','30.02','30.03','30.04','30.05',
  ],
  operations: [
    '4.03','4.06','4.07','4.08',
    '8.03','8.04','8.06','8.07','8.08','8.09','8.10',
    '10.01','10.02','10.03','10.04','10.05','10.06','10.07','10.08','10.09','10.10',
    '11.01','11.02','11.03','11.04','11.05','11.06','11.07','11.08','11.09','11.10',
    '22.01','22.02','22.03','22.04','22.05','22.06','22.07','22.08','22.09','22.10',
    '33.01','33.02','33.03','33.04','33.05',
    '34.01','34.02','34.03','34.04','34.05',
    '35.01','35.02','35.03','35.04','35.05',
    '36.01','36.02','36.03','36.04','36.05',
    '37.01','37.02','37.03','37.04','37.05',
  ],
  marketing: [
    '1.02','1.05','1.12','1.15','1.16',
    '2.07','2.08','2.09','2.13','2.14',
    '24.01','24.02','24.03','24.04','24.05','24.06','24.07','24.08',
    '25.01','25.02','25.03','25.04','25.05','25.06',
    '26.01','26.02','26.03','26.04','26.05','26.06','26.07','26.08',
    '27.01','27.02','27.03','27.04','27.05','27.06','27.07',
    '28.02','28.03','28.04','28.05','28.06','28.07','28.08',
    '21.04','21.05','21.06','21.07',
  ],
  finance: [
    '15.02','15.03','15.04','15.06','15.07','15.09','15.10',
    '16.04','16.05','16.06','16.07','16.08','16.09','16.10',
    '17.01','17.02','17.03','17.04','17.05','17.06','17.07','17.08',
    '18.01','18.02','18.03','18.04','18.05','18.06',
    '23.01','23.02','23.03','23.04','23.05','23.06','23.07','23.08','23.09','23.10',
  ],
  compliance: [
    '20.01','20.02','20.03','20.04','20.05','20.06','20.07','20.08','20.09','20.10',
    '43.01','43.02','43.03','43.04','43.05',
    '44.01','44.02','44.03','44.04',
  ],
  retention: [
    '31.01','31.02','31.03','31.04','31.05','31.06',
    '32.01','32.02','32.03','32.04','32.05',
  ],
  field_service: [
    '38.01','38.02','38.03','38.04','38.05','38.06',
    '39.01','39.02','39.03','39.04','39.05','39.06','39.07',
  ],
  enrichment: [
    '1.03','1.04','1.07','1.08','1.09','1.10','1.11','1.17','1.18','1.19',
    '40.01','40.02','40.03','40.04','40.05','40.06','40.07',
  ],
  infrastructure: [
    '19.01','19.02','19.03','19.04','19.05','19.06',
    '41.01','41.02','41.03','41.04','41.05',
    '42.01','42.02','42.03','42.04','42.05','42.06','42.07',
    '45.02','45.03','45.04','45.05','45.06','45.08','45.09','45.10',
  ],
};

// Map business archetypes to packages
const ARCHETYPE_PACKAGES = {
  saas: ['core', 'sales', 'operations', 'marketing', 'finance', 'retention', 'infrastructure'],
  ecommerce: ['core', 'sales', 'marketing', 'finance', 'retention', 'operations'],
  agency: ['core', 'sales', 'operations', 'marketing', 'finance', 'retention'],
  service_business: ['core', 'sales', 'operations', 'field_service', 'finance', 'compliance', 'retention'],
  marketplace: ['core', 'sales', 'operations', 'marketing', 'finance', 'enrichment', 'retention'],
  directory: ['core', 'sales', 'marketing', 'enrichment', 'operations', 'retention'],
  content: ['core', 'marketing', 'operations', 'retention', 'finance'],
  consulting: ['core', 'sales', 'operations', 'finance', 'compliance', 'retention'],
  default: ['core', 'sales', 'operations', 'marketing', 'finance', 'retention'],
};

// ─── CATEGORY 1: Lead Generation & Prospecting (20) ─────────────────────────
const CAT_01 = [
  { id: '1.01', cat: 1, name: 'Google Business Profile Monitor', trigger: 'cron', cron: '0 8 * * *', steps: [
    { t: 'http', name: 'Check GBP Reviews', method: 'GET', path: '/api/reviews/gbp' },
    { t: 'if', name: 'New Reviews?', cond: '={{ $json.new_count > 0 }}' },
    { t: 'notify', type: 'gbp_update', msg: '={{ $json.new_count }} new Google review(s) found' },
    { t: 'log', activity: 'gbp_monitor', detail: '={{ JSON.stringify($json) }}' },
  ]},
  { id: '1.02', cat: 1, name: 'Competitor New Review Alert', trigger: 'cron', cron: '0 9 * * *', steps: [
    { t: 'http', name: 'Scan Competitor Reviews', method: 'POST', path: '/api/reviews/competitors', body: { scan_type: 'new' } },
    { t: 'if', name: 'Found New?', cond: '={{ $json.reviews?.length > 0 }}' },
    { t: 'email', template: 'competitor_review_alert', to: '={{ $json.owner_email }}' },
    { t: 'log', activity: 'competitor_scan' },
  ]},
  { id: '1.03', cat: 1, name: 'New Business Filing Alert', trigger: 'cron', cron: '0 7 * * 1', steps: [
    { t: 'http', name: 'Check Filing Registry', method: 'GET', path: '/api/prospecting/new-filings' },
    { t: 'if', name: 'New Filings?', cond: '={{ $json.filings?.length > 0 }}' },
    { t: 'crm_contact', source: 'filing_alert' },
    { t: 'notify', type: 'new_filing', msg: '={{ $json.filings.length }} new business filing(s) in your area' },
  ]},
  { id: '1.04', cat: 1, name: 'Expired License/Permit Prospector', trigger: 'cron', cron: '0 7 * * 2', steps: [
    { t: 'http', name: 'Check Expired Permits', method: 'GET', path: '/api/prospecting/expired-licenses' },
    { t: 'if', name: 'Found Expired?', cond: '={{ $json.expired?.length > 0 }}' },
    { t: 'crm_contact', source: 'expired_license' },
    { t: 'email', template: 'license_renewal_outreach', to: '={{ $json.contact_email }}' },
  ]},
  { id: '1.05', cat: 1, name: 'Social Media Keyword Listener', trigger: 'cron', cron: '*/30 * * * *', steps: [
    { t: 'http', name: 'Search Social Keywords', method: 'POST', path: '/api/social/keyword-search', body: { platforms: ['twitter', 'facebook', 'linkedin'] } },
    { t: 'if', name: 'Matches Found?', cond: '={{ $json.matches?.length > 0 }}' },
    { t: 'crm_contact', source: 'social_mention' },
    { t: 'notify', type: 'social_mention', msg: '={{ $json.matches.length }} social mention(s) matching your keywords' },
  ]},
  { id: '1.06', cat: 1, name: 'Google Maps Scraper by Category + Location', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['category', 'location', 'radius'] },
    { t: 'http', name: 'Search Google Maps', method: 'POST', path: '/api/prospecting/maps-search' },
    { t: 'code', name: 'Deduplicate Results', code: 'const seen = new Set(); return $json.results.filter(r => { if (seen.has(r.place_id)) return false; seen.add(r.place_id); return true; });' },
    { t: 'crm_contact', source: 'maps_scrape' },
  ]},
  { id: '1.07', cat: 1, name: 'Yelp Category Scraper', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['category', 'location'] },
    { t: 'http', name: 'Search Yelp', method: 'POST', path: '/api/prospecting/yelp-search' },
    { t: 'crm_contact', source: 'yelp_scrape' },
    { t: 'log', activity: 'yelp_scrape' },
  ]},
  { id: '1.08', cat: 1, name: 'Craigslist Service Post Monitor', trigger: 'cron', cron: '0 */4 * * *', steps: [
    { t: 'http', name: 'Check Craigslist Posts', method: 'GET', path: '/api/prospecting/craigslist' },
    { t: 'if', name: 'New Posts?', cond: '={{ $json.posts?.length > 0 }}' },
    { t: 'crm_contact', source: 'craigslist' },
    { t: 'notify', type: 'craigslist_lead', msg: '={{ $json.posts.length }} new service post(s) on Craigslist' },
  ]},
  { id: '1.09', cat: 1, name: 'Indeed/LinkedIn Job Posting Prospector', trigger: 'cron', cron: '0 8 * * *', steps: [
    { t: 'http', name: 'Search Job Postings', method: 'POST', path: '/api/prospecting/job-postings', body: { platforms: ['indeed', 'linkedin'] } },
    { t: 'if', name: 'Relevant Jobs?', cond: '={{ $json.jobs?.length > 0 }}' },
    { t: 'crm_contact', source: 'job_posting' },
    { t: 'email', template: 'job_posting_outreach', to: '={{ $json.company_email }}' },
  ]},
  { id: '1.10', cat: 1, name: 'Website Technology Detector', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['domain'] },
    { t: 'http', name: 'Detect Tech Stack', method: 'POST', path: '/api/enrichment/tech-stack' },
    { t: 'crm_contact', source: 'tech_detect', extra: { tech_stack: '={{ JSON.stringify($json.technologies) }}' } },
    { t: 'log', activity: 'tech_detection' },
  ]},
  { id: '1.11', cat: 1, name: 'Domain Expiry Prospector', trigger: 'cron', cron: '0 6 * * 1', steps: [
    { t: 'http', name: 'Check Expiring Domains', method: 'GET', path: '/api/prospecting/domain-expiry' },
    { t: 'if', name: 'Expiring Soon?', cond: '={{ $json.domains?.length > 0 }}' },
    { t: 'email', template: 'domain_expiry_outreach', to: '={{ $json.registrant_email }}' },
    { t: 'crm_contact', source: 'domain_expiry' },
  ]},
  { id: '1.12', cat: 1, name: 'Facebook Ad Library Scanner', trigger: 'cron', cron: '0 10 * * 1,4', steps: [
    { t: 'http', name: 'Scan Ad Library', method: 'POST', path: '/api/prospecting/fb-ads', body: { scan_type: 'competitors' } },
    { t: 'if', name: 'New Ads Found?', cond: '={{ $json.ads?.length > 0 }}' },
    { t: 'notify', type: 'competitor_ads', msg: '={{ $json.ads.length }} new competitor ad(s) detected' },
    { t: 'log', activity: 'fb_ad_scan' },
  ]},
  { id: '1.13', cat: 1, name: 'B2B Email Finder from Domain', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['domain', 'role'] },
    { t: 'http', name: 'Find Emails', method: 'POST', path: '/api/enrichment/email-finder' },
    { t: 'crm_contact', source: 'email_finder', extra: { role: '={{ $json.role }}' } },
    { t: 'log', activity: 'email_finder' },
  ]},
  { id: '1.14', cat: 1, name: 'Cold Outreach Sequence Launcher', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'company', 'sequence_id'] },
    { t: 'http', name: 'Enqueue Sequence', method: 'POST', path: '/api/sequences/enqueue', body: { sequence: '={{ $json.sequence_id }}' } },
    { t: 'crm_contact', source: 'cold_outreach' },
    { t: 'log', activity: 'outreach_launched' },
  ]},
  { id: '1.15', cat: 1, name: 'Direct Mail Trigger', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['name', 'address', 'template_id'] },
    { t: 'http', name: 'Send Direct Mail', method: 'POST', path: '/api/mail/direct', body: { template: '={{ $json.template_id }}' } },
    { t: 'log', activity: 'direct_mail_sent' },
    { t: 'notify', type: 'direct_mail', msg: '={{ "Direct mail sent to " + $json.name }}' },
  ]},
  { id: '1.16', cat: 1, name: 'Networking Event Finder', trigger: 'cron', cron: '0 9 * * 1', steps: [
    { t: 'http', name: 'Search Events', method: 'POST', path: '/api/prospecting/events', body: { range_days: 14 } },
    { t: 'if', name: 'Events Found?', cond: '={{ $json.events?.length > 0 }}' },
    { t: 'email', template: 'upcoming_events', to: '={{ $json.owner_email }}' },
    { t: 'log', activity: 'event_search' },
  ]},
  { id: '1.17', cat: 1, name: 'Permit Application Monitor', trigger: 'cron', cron: '0 7 * * 3', steps: [
    { t: 'http', name: 'Check Permit Apps', method: 'GET', path: '/api/prospecting/permits' },
    { t: 'if', name: 'New Permits?', cond: '={{ $json.permits?.length > 0 }}' },
    { t: 'crm_contact', source: 'permit_app' },
    { t: 'notify', type: 'new_permits', msg: '={{ $json.permits.length }} new permit application(s)' },
  ]},
  { id: '1.18', cat: 1, name: 'Property Sale Trigger', trigger: 'cron', cron: '0 8 * * *', steps: [
    { t: 'http', name: 'Check Property Sales', method: 'GET', path: '/api/prospecting/property-sales' },
    { t: 'if', name: 'New Sales?', cond: '={{ $json.sales?.length > 0 }}' },
    { t: 'crm_contact', source: 'property_sale' },
    { t: 'email', template: 'new_homeowner_outreach', to: '={{ $json.buyer_email }}' },
  ]},
  { id: '1.19', cat: 1, name: 'Bankruptcy/Lien Filing Monitor', trigger: 'cron', cron: '0 7 * * 4', steps: [
    { t: 'http', name: 'Check Filings', method: 'GET', path: '/api/prospecting/court-filings' },
    { t: 'if', name: 'New Filings?', cond: '={{ $json.filings?.length > 0 }}' },
    { t: 'log', activity: 'court_filing_scan' },
    { t: 'notify', type: 'court_filings', msg: '={{ $json.filings.length }} relevant court filing(s) found' },
  ]},
  { id: '1.20', cat: 1, name: 'Referral Source Activity Tracker', trigger: 'cron', cron: '0 17 * * 5', steps: [
    { t: 'http', name: 'Get Referral Activity', method: 'GET', path: '/api/referrals/activity-report' },
    { t: 'email', template: 'referral_activity_report', to: '={{ $json.owner_email }}' },
    { t: 'log', activity: 'referral_report' },
  ]},
];

// ─── CATEGORY 2: Lead Capture & Intake (15) ─────────────────────────────────
const CAT_02 = [
  { id: '2.01', cat: 2, name: 'Web Form to CRM', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'phone', 'message', 'source'] },
    { t: 'crm_contact', source: 'web_form' },
    { t: 'email', template: 'form_confirmation', to: '={{ $json.email }}' },
    { t: 'notify', type: 'new_lead', msg: '={{ "New web form lead: " + $json.name }}' },
  ]},
  { id: '2.02', cat: 2, name: 'Phone Call to CRM Lead', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['caller_phone', 'caller_name', 'duration', 'recording_url'] },
    { t: 'crm_contact', source: 'phone_call', extra: { phone: '={{ $json.caller_phone }}' } },
    { t: 'log', activity: 'inbound_call', detail: '={{ "Duration: " + $json.duration + "s" }}' },
    { t: 'notify', type: 'inbound_call', msg: '={{ "Inbound call from " + ($json.caller_name || $json.caller_phone) }}' },
  ]},
  { id: '2.03', cat: 2, name: 'Chat Widget to CRM Lead', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'chat_transcript'] },
    { t: 'crm_contact', source: 'chat_widget' },
    { t: 'log', activity: 'chat_lead', detail: '={{ $json.chat_transcript?.substring(0, 200) }}' },
    { t: 'notify', type: 'chat_lead', msg: '={{ "New chat lead: " + ($json.name || $json.email) }}' },
  ]},
  { id: '2.04', cat: 2, name: 'Facebook Lead Ad to CRM', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'phone', 'ad_name', 'form_name'] },
    { t: 'crm_contact', source: 'facebook_lead_ad', extra: { ad: '={{ $json.ad_name }}' } },
    { t: 'email', template: 'lead_ad_followup', to: '={{ $json.email }}' },
    { t: 'sms', msg: '={{ "Thanks for your interest, " + $json.name + "! We\\u2019ll be in touch shortly." }}' },
  ]},
  { id: '2.05', cat: 2, name: 'Google Ads Call Extension Logger', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['caller_phone', 'campaign', 'keyword', 'duration'] },
    { t: 'crm_contact', source: 'google_ads_call', extra: { campaign: '={{ $json.campaign }}', keyword: '={{ $json.keyword }}' } },
    { t: 'log', activity: 'google_ads_call' },
  ]},
  { id: '2.06', cat: 2, name: 'Email Inquiry Parser', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['from_email', 'from_name', 'subject', 'body'] },
    { t: 'http', name: 'AI Parse Intent', method: 'POST', path: '/api/ai/parse', body: { text: '={{ $json.body }}', type: 'inquiry' } },
    { t: 'crm_contact', source: 'email_inquiry', extra: { intent: '={{ $json.parsed_intent }}' } },
    { t: 'notify', type: 'email_inquiry', msg: '={{ "Email inquiry from " + $json.from_name + ": " + $json.subject }}' },
  ]},
  { id: '2.07', cat: 2, name: 'Business Card Scanner to CRM', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['image_url'] },
    { t: 'http', name: 'OCR Business Card', method: 'POST', path: '/api/ai/ocr', body: { image: '={{ $json.image_url }}', type: 'business_card' } },
    { t: 'crm_contact', source: 'business_card' },
    { t: 'log', activity: 'card_scanned' },
  ]},
  { id: '2.08', cat: 2, name: 'QR Code Lead Capture', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'phone', 'qr_source'] },
    { t: 'crm_contact', source: 'qr_code', extra: { qr_source: '={{ $json.qr_source }}' } },
    { t: 'email', template: 'qr_capture_followup', to: '={{ $json.email }}' },
    { t: 'log', activity: 'qr_lead_capture' },
  ]},
  { id: '2.09', cat: 2, name: 'Voicemail Transcription to CRM', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['caller_phone', 'recording_url', 'timestamp'] },
    { t: 'http', name: 'Transcribe Voicemail', method: 'POST', path: '/api/ai/transcribe', body: { audio_url: '={{ $json.recording_url }}' } },
    { t: 'crm_contact', source: 'voicemail', extra: { transcript: '={{ $json.transcript }}' } },
    { t: 'notify', type: 'voicemail', msg: '={{ "Voicemail from " + $json.caller_phone + ": " + $json.transcript?.substring(0, 100) }}' },
  ]},
  { id: '2.10', cat: 2, name: 'SMS Keyword Opt-In', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['phone', 'keyword', 'message'] },
    { t: 'crm_contact', source: 'sms_optin', extra: { keyword: '={{ $json.keyword }}' } },
    { t: 'sms', msg: '={{ "You\\u2019re signed up! Reply STOP to unsubscribe." }}' },
    { t: 'log', activity: 'sms_optin' },
  ]},
  { id: '2.11', cat: 2, name: 'Typeform/Survey Response to CRM', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'responses'] },
    { t: 'crm_contact', source: 'survey', extra: { survey_data: '={{ JSON.stringify($json.responses) }}' } },
    { t: 'email', template: 'survey_thanks', to: '={{ $json.email }}' },
    { t: 'log', activity: 'survey_response' },
  ]},
  { id: '2.12', cat: 2, name: 'Duplicate Lead Detector & Merger', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'phone', 'name'] },
    { t: 'http', name: 'Check Duplicates', method: 'POST', path: '/api/crm/dedup', body: { email: '={{ $json.email }}', phone: '={{ $json.phone }}' } },
    { t: 'if', name: 'Is Duplicate?', cond: '={{ $json.is_duplicate === true }}' },
    { t: 'http', name: 'Merge Records', method: 'POST', path: '/api/crm/merge' },
  ]},
  { id: '2.13', cat: 2, name: 'UTM Parameter Capture & Storage', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] },
    { t: 'http', name: 'Store UTM Data', method: 'POST', path: '/api/analytics/utm', body: { email: '={{ $json.email }}' } },
    { t: 'log', activity: 'utm_captured', detail: '={{ $json.utm_source + "/" + $json.utm_medium + "/" + $json.utm_campaign }}' },
  ]},
  { id: '2.14', cat: 2, name: 'Multi-Channel Lead Deduplication', trigger: 'cron', cron: '0 2 * * *', steps: [
    { t: 'http', name: 'Run Dedup Scan', method: 'POST', path: '/api/crm/dedup-scan' },
    { t: 'if', name: 'Duplicates Found?', cond: '={{ $json.duplicates?.length > 0 }}' },
    { t: 'http', name: 'Auto-Merge', method: 'POST', path: '/api/crm/bulk-merge' },
    { t: 'notify', type: 'dedup_report', msg: '={{ $json.merged_count + " duplicate(s) merged across channels" }}' },
  ]},
  { id: '2.15', cat: 2, name: 'After-Hours Auto-Responder', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'message', 'channel'] },
    { t: 'code', name: 'Check Business Hours', code: 'const h = new Date().getHours(); return { ...items[0].json, is_after_hours: h < 8 || h >= 18 };' },
    { t: 'if', name: 'After Hours?', cond: '={{ $json.is_after_hours === true }}' },
    { t: 'email', template: 'after_hours_auto_reply', to: '={{ $json.email }}' },
    { t: 'sms', msg: '={{ "Thanks for reaching out! We\\u2019re currently closed but will respond first thing tomorrow morning." }}' },
  ]},
];

// ─── CATEGORY 3: Lead Qualification & Scoring (10) ──────────────────────────
const CAT_03 = [
  { id: '3.01', cat: 3, name: 'Lead Score Calculator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'company_size', 'industry', 'budget', 'urgency'] },
    { t: 'http', name: 'Calculate Score', method: 'POST', path: '/api/leads/score' },
    { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/score' },
    { t: 'if', name: 'Hot Lead?', cond: '={{ $json.score >= 80 }}' },
    { t: 'notify', type: 'hot_lead', msg: '={{ "Hot lead scored " + $json.score + ": " + $json.email }}' },
  ]},
  { id: '3.02', cat: 3, name: 'Behavioral Score Incrementer', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'action', 'page', 'timestamp'] },
    { t: 'http', name: 'Increment Score', method: 'POST', path: '/api/leads/score-increment', body: { action: '={{ $json.action }}' } },
    { t: 'log', activity: 'score_increment', detail: '={{ $json.action + " +" + $json.points }}' },
  ]},
  { id: '3.03', cat: 3, name: 'Budget Qualifier', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'stated_budget', 'service_interest'] },
    { t: 'http', name: 'Check Budget Fit', method: 'POST', path: '/api/leads/budget-qualify' },
    { t: 'http', name: 'Update CRM Tag', method: 'POST', path: '/api/crm/contacts/tag', body: { tag: '={{ $json.budget_tier }}' } },
    { t: 'log', activity: 'budget_qualified' },
  ]},
  { id: '3.04', cat: 3, name: 'Service Area Validator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'zip_code', 'city', 'state'] },
    { t: 'http', name: 'Validate Area', method: 'POST', path: '/api/leads/area-check' },
    { t: 'if', name: 'In Service Area?', cond: '={{ $json.in_service_area === true }}' },
    { t: 'http', name: 'Tag Contact', method: 'POST', path: '/api/crm/contacts/tag', body: { tag: '={{ $json.in_service_area ? "in-area" : "out-of-area" }}' } },
  ]},
  { id: '3.05', cat: 3, name: 'Company Size Enrichment', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'company_domain'] },
    { t: 'http', name: 'Enrich Company', method: 'POST', path: '/api/enrichment/company' },
    { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/enrich', body: { company_size: '={{ $json.employee_count }}', revenue: '={{ $json.annual_revenue }}' } },
    { t: 'log', activity: 'company_enriched' },
  ]},
  { id: '3.06', cat: 3, name: 'Decision-Maker Validator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'title', 'email'] },
    { t: 'http', name: 'Validate DM', method: 'POST', path: '/api/enrichment/validate-dm' },
    { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/tag', body: { tag: '={{ $json.is_decision_maker ? "dm-verified" : "gatekeeper" }}' } },
    { t: 'log', activity: 'dm_validation' },
  ]},
  { id: '3.07', cat: 3, name: 'Hot Lead Alert', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'score', 'source'] },
    { t: 'if', name: 'Score >= 80?', cond: '={{ $json.score >= 80 }}' },
    { t: 'notify', type: 'hot_lead', msg: '={{ "HOT LEAD: " + $json.name + " (score: " + $json.score + ", source: " + $json.source + ")" }}' },
    { t: 'sms', msg: '={{ "Hot lead alert: " + $json.name + " scored " + $json.score + ". Follow up ASAP." }}', to_owner: true },
    { t: 'email', template: 'hot_lead_internal_alert', to: '={{ $json.owner_email }}' },
  ]},
  { id: '3.08', cat: 3, name: 'Lead Decay Timer', trigger: 'cron', cron: '0 6 * * *', steps: [
    { t: 'http', name: 'Check Stale Leads', method: 'GET', path: '/api/leads/stale?days=14' },
    { t: 'if', name: 'Stale Found?', cond: '={{ $json.stale_leads?.length > 0 }}' },
    { t: 'http', name: 'Apply Decay', method: 'POST', path: '/api/leads/apply-decay' },
    { t: 'notify', type: 'lead_decay', msg: '={{ $json.decayed_count + " lead score(s) decayed due to inactivity" }}' },
  ]},
  { id: '3.09', cat: 3, name: 'Competitor Customer Detector', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'company_domain'] },
    { t: 'http', name: 'Check Competitor Tech', method: 'POST', path: '/api/enrichment/tech-stack' },
    { t: 'if', name: 'Uses Competitor?', cond: '={{ $json.uses_competitor === true }}' },
    { t: 'http', name: 'Tag as Competitor User', method: 'POST', path: '/api/crm/contacts/tag', body: { tag: 'uses-competitor', competitor: '={{ $json.competitor_name }}' } },
  ]},
  { id: '3.10', cat: 3, name: 'Urgency Detector', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'message', 'channel'] },
    { t: 'http', name: 'AI Detect Urgency', method: 'POST', path: '/api/ai/parse', body: { text: '={{ $json.message }}', type: 'urgency' } },
    { t: 'if', name: 'Is Urgent?', cond: '={{ $json.urgency_score >= 0.7 }}' },
    { t: 'http', name: 'Boost Score', method: 'POST', path: '/api/leads/score-increment', body: { points: 25 } },
    { t: 'notify', type: 'urgent_lead', msg: '={{ "URGENT: " + $json.contact_id + " — " + $json.message?.substring(0, 80) }}' },
  ]},
];

// ─── CATEGORY 4: CRM & Contact Management (10) ─────────────────────────────
const CAT_04 = [
  { id: '4.01', cat: 4, name: 'Contact Field Standardizer', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'name', 'phone', 'email', 'address'] },
    { t: 'http', name: 'Standardize Fields', method: 'POST', path: '/api/crm/standardize', body: { phone_format: 'E164', name_case: 'title' } },
    { t: 'http', name: 'Update Contact', method: 'PATCH', path: '/api/crm/contacts/update' },
  ]},
  { id: '4.02', cat: 4, name: 'Lifecycle Stage Automator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'event', 'metadata'] },
    { t: 'http', name: 'Compute Stage', method: 'POST', path: '/api/crm/lifecycle-stage' },
    { t: 'http', name: 'Update Stage', method: 'PATCH', path: '/api/crm/contacts/stage' },
    { t: 'log', activity: 'stage_change', detail: '={{ $json.old_stage + " → " + $json.new_stage }}' },
  ]},
  { id: '4.03', cat: 4, name: 'Contact Birthday/Anniversary Reminder', trigger: 'cron', cron: '0 7 * * *', steps: [
    { t: 'http', name: 'Check Dates', method: 'GET', path: '/api/crm/contacts/upcoming-dates?days=7' },
    { t: 'if', name: 'Any Upcoming?', cond: '={{ $json.contacts?.length > 0 }}' },
    { t: 'email', template: 'birthday_greeting', to: '={{ $json.contacts[0].email }}' },
    { t: 'notify', type: 'birthday_reminder', msg: '={{ $json.contacts.length + " contact birthday/anniversary reminder(s)" }}' },
  ]},
  { id: '4.04', cat: 4, name: 'Inactive Contact Tagger', trigger: 'cron', cron: '0 3 * * 0', steps: [
    { t: 'http', name: 'Find Inactive', method: 'GET', path: '/api/crm/contacts/inactive?days=90' },
    { t: 'if', name: 'Found Inactive?', cond: '={{ $json.contacts?.length > 0 }}' },
    { t: 'http', name: 'Bulk Tag', method: 'POST', path: '/api/crm/contacts/bulk-tag', body: { tag: 'inactive-90d' } },
    { t: 'log', activity: 'inactive_tagging', detail: '={{ $json.tagged_count + " contacts tagged inactive" }}' },
  ]},
  { id: '4.05', cat: 4, name: 'Contact Record Completeness Scorer', trigger: 'cron', cron: '0 4 * * 1', steps: [
    { t: 'http', name: 'Score Completeness', method: 'GET', path: '/api/crm/contacts/completeness-audit' },
    { t: 'if', name: 'Incomplete Found?', cond: '={{ $json.incomplete?.length > 0 }}' },
    { t: 'notify', type: 'data_quality', msg: '={{ $json.incomplete.length + " contact(s) with incomplete records" }}' },
    { t: 'log', activity: 'completeness_audit' },
  ]},
  { id: '4.06', cat: 4, name: 'Automatic Timezone Detection', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'ip_address', 'phone'] },
    { t: 'http', name: 'Detect Timezone', method: 'POST', path: '/api/enrichment/timezone' },
    { t: 'http', name: 'Update Contact', method: 'PATCH', path: '/api/crm/contacts/update', body: { timezone: '={{ $json.timezone }}' } },
  ]},
  { id: '4.07', cat: 4, name: 'Tag Cleanup & Consolidation', trigger: 'cron', cron: '0 2 * * 0', steps: [
    { t: 'http', name: 'Audit Tags', method: 'GET', path: '/api/crm/tags/audit' },
    { t: 'if', name: 'Duplicates Found?', cond: '={{ $json.duplicate_tags?.length > 0 }}' },
    { t: 'http', name: 'Merge Tags', method: 'POST', path: '/api/crm/tags/merge' },
    { t: 'log', activity: 'tag_cleanup', detail: '={{ $json.merged_count + " tag(s) consolidated" }}' },
  ]},
  { id: '4.08', cat: 4, name: 'Contact Activity Timeline Generator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id'] },
    { t: 'http', name: 'Build Timeline', method: 'GET', path: '/api/crm/contacts/timeline' },
    { t: 'log', activity: 'timeline_generated' },
  ]},
  { id: '4.09', cat: 4, name: 'VIP Contact Escalation Rules', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'event_type', 'urgency'] },
    { t: 'http', name: 'Check VIP Status', method: 'GET', path: '/api/crm/contacts/vip-check' },
    { t: 'if', name: 'Is VIP?', cond: '={{ $json.is_vip === true }}' },
    { t: 'notify', type: 'vip_escalation', msg: '={{ "VIP " + $json.event_type + ": " + $json.contact_name }}' },
    { t: 'sms', msg: '={{ "VIP client " + $json.contact_name + " needs attention: " + $json.event_type }}', to_owner: true },
  ]},
  { id: '4.10', cat: 4, name: 'Stale Deal Notifier', trigger: 'cron', cron: '0 8 * * 1,4', steps: [
    { t: 'http', name: 'Find Stale Deals', method: 'GET', path: '/api/crm/deals/stale?days=7' },
    { t: 'if', name: 'Stale Found?', cond: '={{ $json.deals?.length > 0 }}' },
    { t: 'email', template: 'stale_deals_digest', to: '={{ $json.owner_email }}' },
    { t: 'notify', type: 'stale_deals', msg: '={{ $json.deals.length + " deal(s) stagnant for 7+ days" }}' },
  ]},
];

// ─── CATEGORY 5: Sales Pipeline & Follow-Up (10) ───────────────────────────
const CAT_05 = [
  { id: '5.01', cat: 5, name: 'Speed-to-Lead Auto-Response', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'phone', 'source'] },
    { t: 'email', template: 'speed_to_lead', to: '={{ $json.email }}' },
    { t: 'sms', msg: '={{ "Hi " + $json.name + "! Thanks for reaching out. A team member will call you shortly." }}' },
    { t: 'notify', type: 'new_lead', msg: '={{ "Speed-to-lead triggered for " + $json.name }}' },
  ]},
  { id: '5.02', cat: 5, name: 'Follow-Up Sequence Engine', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'sequence_name', 'delay_days'] },
    { t: 'http', name: 'Enqueue Sequence', method: 'POST', path: '/api/sequences/start' },
    { t: 'log', activity: 'sequence_started', detail: '={{ $json.sequence_name }}' },
  ]},
  { id: '5.03', cat: 5, name: 'Meeting No-Show Recovery', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'email', 'name', 'meeting_type'] },
    { t: 'email', template: 'no_show_recovery', to: '={{ $json.email }}' },
    { t: 'sms', msg: '={{ "Hi " + $json.name + ", we missed you at our meeting. Want to reschedule? Reply YES." }}' },
    { t: 'http', name: 'Update CRM', method: 'POST', path: '/api/crm/activities', body: { type: 'no_show', contact_id: '={{ $json.contact_id }}' } },
  ]},
  { id: '5.04', cat: 5, name: 'Objection Response Suggester', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'objection_text'] },
    { t: 'http', name: 'AI Suggest Response', method: 'POST', path: '/api/ai/parse', body: { text: '={{ $json.objection_text }}', type: 'objection_response' } },
    { t: 'notify', type: 'objection_help', msg: '={{ "Suggested response: " + $json.suggested_response?.substring(0, 200) }}' },
  ]},
  { id: '5.05', cat: 5, name: 'Pipeline Stage SLA Monitor', trigger: 'cron', cron: '0 9 * * *', steps: [
    { t: 'http', name: 'Check SLA Breaches', method: 'GET', path: '/api/crm/deals/sla-check' },
    { t: 'if', name: 'Breaches Found?', cond: '={{ $json.breaches?.length > 0 }}' },
    { t: 'notify', type: 'sla_breach', msg: '={{ $json.breaches.length + " deal(s) past SLA deadline" }}' },
    { t: 'email', template: 'sla_breach_alert', to: '={{ $json.owner_email }}' },
  ]},
  { id: '5.06', cat: 5, name: 'Win/Loss Reason Logger', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['deal_id', 'outcome', 'reason', 'competitor'] },
    { t: 'http', name: 'Log Outcome', method: 'POST', path: '/api/crm/deals/close', body: { outcome: '={{ $json.outcome }}', reason: '={{ $json.reason }}' } },
    { t: 'log', activity: 'deal_closed', detail: '={{ $json.outcome + ": " + $json.reason }}' },
  ]},
  { id: '5.07', cat: 5, name: 'Auto-Assign Leads by Territory', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'zip_code', 'state'] },
    { t: 'http', name: 'Assign Territory', method: 'POST', path: '/api/crm/leads/assign-territory' },
    { t: 'notify', type: 'lead_assigned', msg: '={{ "Lead assigned to " + $json.assigned_to + " (territory: " + $json.territory + ")" }}' },
  ]},
  { id: '5.08', cat: 5, name: 'Proposal Follow-Up Nudge', trigger: 'cron', cron: '0 10 * * *', steps: [
    { t: 'http', name: 'Check Unsigned Proposals', method: 'GET', path: '/api/proposals/unsigned?days=3' },
    { t: 'if', name: 'Found Unsigned?', cond: '={{ $json.proposals?.length > 0 }}' },
    { t: 'email', template: 'proposal_followup', to: '={{ $json.proposals[0].client_email }}' },
    { t: 'log', activity: 'proposal_nudge' },
  ]},
  { id: '5.09', cat: 5, name: 'Lost Deal Reactivation Campaign', trigger: 'cron', cron: '0 9 1 * *', steps: [
    { t: 'http', name: 'Get Lost Deals', method: 'GET', path: '/api/crm/deals/lost?days_ago_min=60&days_ago_max=180' },
    { t: 'if', name: 'Found Lost?', cond: '={{ $json.deals?.length > 0 }}' },
    { t: 'http', name: 'Start Reactivation', method: 'POST', path: '/api/sequences/bulk-start', body: { sequence: 'lost_deal_reactivation' } },
    { t: 'log', activity: 'reactivation_campaign', detail: '={{ $json.enrolled_count + " contacts enrolled" }}' },
  ]},
  { id: '5.10', cat: 5, name: 'Sales Activity Leaderboard', trigger: 'cron', cron: '0 17 * * 5', steps: [
    { t: 'http', name: 'Generate Leaderboard', method: 'GET', path: '/api/reports/sales-leaderboard' },
    { t: 'email', template: 'sales_leaderboard', to: '={{ $json.team_email }}' },
    { t: 'log', activity: 'leaderboard_sent' },
  ]},
];

// ─── CATEGORY 6: Proposals, Estimates & Quoting (8) ────────────────────────
const CAT_06 = [
  { id: '6.01', cat: 6, name: 'Auto-Generate Proposal from Intake', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'service_type', 'scope', 'budget'] },
    { t: 'http', name: 'Generate Proposal', method: 'POST', path: '/api/proposals/generate' },
    { t: 'email', template: 'proposal_delivery', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'proposal_generated' },
  ]},
  { id: '6.02', cat: 6, name: 'Dynamic Pricing Calculator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['service_type', 'scope', 'urgency', 'client_tier'] },
    { t: 'http', name: 'Calculate Price', method: 'POST', path: '/api/pricing/calculate' },
    { t: 'log', activity: 'price_calculated', detail: '={{ "$" + $json.total }}' },
  ]},
  { id: '6.03', cat: 6, name: 'Multi-Option Quote Generator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'service_type'] },
    { t: 'http', name: 'Generate Options', method: 'POST', path: '/api/proposals/multi-option' },
    { t: 'email', template: 'quote_options', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'multi_quote_sent' },
  ]},
  { id: '6.04', cat: 6, name: 'Proposal View Tracker', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['proposal_id', 'viewer_email', 'duration_seconds'] },
    { t: 'http', name: 'Log View', method: 'POST', path: '/api/proposals/track-view' },
    { t: 'if', name: 'Long View?', cond: '={{ $json.duration_seconds > 120 }}' },
    { t: 'notify', type: 'proposal_engaged', msg: '={{ $json.viewer_email + " spent " + Math.round($json.duration_seconds/60) + "min on proposal" }}' },
  ]},
  { id: '6.05', cat: 6, name: 'E-Signature Request Automator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['proposal_id', 'client_email', 'document_url'] },
    { t: 'http', name: 'Send for Signature', method: 'POST', path: '/api/esign/request' },
    { t: 'email', template: 'esign_request', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'esign_requested' },
  ]},
  { id: '6.06', cat: 6, name: 'Quote Expiry Reminder', trigger: 'cron', cron: '0 9 * * *', steps: [
    { t: 'http', name: 'Check Expiring', method: 'GET', path: '/api/proposals/expiring?days=3' },
    { t: 'if', name: 'Expiring Found?', cond: '={{ $json.proposals?.length > 0 }}' },
    { t: 'email', template: 'quote_expiring', to: '={{ $json.proposals[0].client_email }}' },
    { t: 'log', activity: 'quote_expiry_reminder' },
  ]},
  { id: '6.07', cat: 6, name: 'Competitive Quote Comparison Sheet', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'competitor_quotes'] },
    { t: 'http', name: 'Generate Comparison', method: 'POST', path: '/api/proposals/comparison' },
    { t: 'email', template: 'quote_comparison', to: '={{ $json.client_email }}' },
  ]},
  { id: '6.08', cat: 6, name: 'Scope Change Order Generator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['project_id', 'change_description', 'cost_impact'] },
    { t: 'http', name: 'Generate Change Order', method: 'POST', path: '/api/proposals/change-order' },
    { t: 'email', template: 'change_order', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'change_order_generated' },
  ]},
];

// ─── CATEGORY 7: Contracts & Agreements (7) ─────────────────────────────────
const CAT_07 = [
  { id: '7.01', cat: 7, name: 'Contract Template Selector', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['service_type', 'client_type', 'contract_value'] },
    { t: 'http', name: 'Select Template', method: 'POST', path: '/api/contracts/select-template' },
    { t: 'log', activity: 'template_selected', detail: '={{ $json.template_name }}' },
  ]},
  { id: '7.02', cat: 7, name: 'Contract Field Auto-Filler', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['template_id', 'contact_id'] },
    { t: 'http', name: 'Fill Contract', method: 'POST', path: '/api/contracts/auto-fill' },
    { t: 'log', activity: 'contract_filled' },
  ]},
  { id: '7.03', cat: 7, name: 'Contract Expiry/Renewal Tracker', trigger: 'cron', cron: '0 8 * * 1', steps: [
    { t: 'http', name: 'Check Expiring', method: 'GET', path: '/api/contracts/expiring?days=30' },
    { t: 'if', name: 'Expiring Found?', cond: '={{ $json.contracts?.length > 0 }}' },
    { t: 'email', template: 'contract_renewal_reminder', to: '={{ $json.owner_email }}' },
    { t: 'notify', type: 'contract_expiry', msg: '={{ $json.contracts.length + " contract(s) expiring in 30 days" }}' },
  ]},
  { id: '7.04', cat: 7, name: 'Signed Contract Filing', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contract_id', 'signed_document_url'] },
    { t: 'http', name: 'File Signed Contract', method: 'POST', path: '/api/contracts/file' },
    { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/deals/contract-signed' },
    { t: 'log', activity: 'contract_filed' },
  ]},
  { id: '7.05', cat: 7, name: 'NDA Auto-Generator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'company_name', 'purpose'] },
    { t: 'http', name: 'Generate NDA', method: 'POST', path: '/api/contracts/generate-nda' },
    { t: 'email', template: 'nda_for_signature', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'nda_generated' },
  ]},
  { id: '7.06', cat: 7, name: 'Contract Amendment Tracker', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contract_id', 'amendment_description', 'effective_date'] },
    { t: 'http', name: 'Log Amendment', method: 'POST', path: '/api/contracts/amendment' },
    { t: 'notify', type: 'contract_amendment', msg: '={{ "Contract amendment: " + $json.amendment_description }}' },
  ]},
  { id: '7.07', cat: 7, name: 'Auto-Terminate Expired Contracts', trigger: 'cron', cron: '0 1 * * *', steps: [
    { t: 'http', name: 'Find Expired', method: 'GET', path: '/api/contracts/expired' },
    { t: 'if', name: 'Expired Found?', cond: '={{ $json.contracts?.length > 0 }}' },
    { t: 'http', name: 'Terminate', method: 'POST', path: '/api/contracts/bulk-terminate' },
    { t: 'log', activity: 'contracts_terminated', detail: '={{ $json.terminated_count + " contract(s) auto-terminated" }}' },
  ]},
];

// ─── CATEGORY 8: Client Onboarding (10) ─────────────────────────────────────
const CAT_08 = [
  { id: '8.01', cat: 8, name: 'Welcome Email + Portal Credentials', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['email', 'name', 'portal_url', 'temp_password'] },
    { t: 'email', template: 'welcome_portal_credentials', to: '={{ $json.email }}' },
    { t: 'log', activity: 'welcome_sent' },
  ]},
  { id: '8.02', cat: 8, name: 'Onboarding Checklist Generator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'service_type'] },
    { t: 'http', name: 'Generate Checklist', method: 'POST', path: '/api/onboarding/checklist' },
    { t: 'email', template: 'onboarding_checklist', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'checklist_created' },
  ]},
  { id: '8.03', cat: 8, name: 'Document Collection Request', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'required_docs'] },
    { t: 'email', template: 'document_collection', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'docs_requested' },
  ]},
  { id: '8.04', cat: 8, name: 'Document Received Confirmation', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'document_type', 'file_name'] },
    { t: 'email', template: 'document_received', to: '={{ $json.client_email }}' },
    { t: 'http', name: 'Update Checklist', method: 'PATCH', path: '/api/onboarding/checklist-item', body: { status: 'received' } },
  ]},
  { id: '8.05', cat: 8, name: 'Onboarding Progress Tracker', trigger: 'cron', cron: '0 9 * * *', steps: [
    { t: 'http', name: 'Check Progress', method: 'GET', path: '/api/onboarding/progress' },
    { t: 'if', name: 'Stalled?', cond: '={{ $json.stalled?.length > 0 }}' },
    { t: 'email', template: 'onboarding_nudge', to: '={{ $json.stalled[0].client_email }}' },
    { t: 'notify', type: 'onboarding_stall', msg: '={{ $json.stalled.length + " client(s) stalled in onboarding" }}' },
  ]},
  { id: '8.06', cat: 8, name: 'Account Setup Automator', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'plan_id', 'payment_id'] },
    { t: 'http', name: 'Provision Account', method: 'POST', path: '/api/accounts/provision' },
    { t: 'email', template: 'account_ready', to: '={{ $json.client_email }}' },
    { t: 'log', activity: 'account_provisioned' },
  ]},
  { id: '8.07', cat: 8, name: 'Kickoff Meeting Auto-Scheduler', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'email', 'name'] },
    { t: 'http', name: 'Schedule Kickoff', method: 'POST', path: '/api/booking/schedule', body: { type: 'kickoff', duration: 30 } },
    { t: 'email', template: 'kickoff_scheduled', to: '={{ $json.email }}' },
  ]},
  { id: '8.08', cat: 8, name: 'Client Information Questionnaire', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'email'] },
    { t: 'http', name: 'Generate Questionnaire', method: 'POST', path: '/api/onboarding/questionnaire' },
    { t: 'email', template: 'intake_questionnaire', to: '={{ $json.email }}' },
  ]},
  { id: '8.09', cat: 8, name: 'Team Introduction Email', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'email', 'assigned_team'] },
    { t: 'email', template: 'team_introduction', to: '={{ $json.email }}' },
    { t: 'log', activity: 'team_intro_sent' },
  ]},
  { id: '8.10', cat: 8, name: 'First 30-Day Check-In Scheduler', trigger: 'webhook', steps: [
    { t: 'extract', fields: ['contact_id', 'email', 'onboard_date'] },
    { t: 'http', name: 'Schedule Check-In', method: 'POST', path: '/api/booking/schedule', body: { type: 'check_in_30d', delay_days: 30 } },
    { t: 'log', activity: 'checkin_scheduled' },
  ]},
];

// ─── CATEGORIES 9-14: Service Delivery ──────────────────────────────────────
const CAT_09 = [
  { id: '9.01', cat: 9, name: 'Self-Service Booking Page', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'service', 'preferred_time'] }, { t: 'http', name: 'Create Booking', method: 'POST', path: '/api/booking/create' }, { t: 'email', template: 'booking_link', to: '={{ $json.email }}' }]},
  { id: '9.02', cat: 9, name: 'Appointment Confirmation Email', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'date', 'time', 'service'] }, { t: 'email', template: 'appointment_confirmed', to: '={{ $json.email }}' }, { t: 'log', activity: 'appt_confirmed' }]},
  { id: '9.03', cat: 9, name: 'Appointment Reminder (24-Hour)', trigger: 'cron', cron: '0 9 * * *', steps: [{ t: 'http', name: 'Get Tomorrow Appts', method: 'GET', path: '/api/booking/upcoming?hours=24' }, { t: 'if', name: 'Any?', cond: '={{ $json.appointments?.length > 0 }}' }, { t: 'email', template: 'appointment_reminder_24h', to: '={{ $json.appointments[0].email }}' }, { t: 'sms', msg: '={{ "Reminder: Your appointment is tomorrow at " + $json.appointments[0].time }}' }]},
  { id: '9.04', cat: 9, name: 'Appointment Reminder (1-Hour)', trigger: 'cron', cron: '0 * * * *', steps: [{ t: 'http', name: 'Get Upcoming', method: 'GET', path: '/api/booking/upcoming?hours=1' }, { t: 'if', name: 'Any?', cond: '={{ $json.appointments?.length > 0 }}' }, { t: 'sms', msg: '={{ "Your appointment starts in 1 hour. See you soon!" }}' }]},
  { id: '9.05', cat: 9, name: 'Reschedule/Cancel Handler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['booking_id', 'action', 'new_date'] }, { t: 'http', name: 'Process Change', method: 'POST', path: '/api/booking/modify' }, { t: 'email', template: 'booking_modified', to: '={{ $json.client_email }}' }, { t: 'log', activity: 'booking_modified' }]},
  { id: '9.06', cat: 9, name: 'No-Show Tracker & Penalty System', trigger: 'webhook', steps: [{ t: 'extract', fields: ['booking_id', 'contact_id'] }, { t: 'http', name: 'Record No-Show', method: 'POST', path: '/api/booking/no-show' }, { t: 'http', name: 'Check Penalty', method: 'POST', path: '/api/billing/no-show-fee' }, { t: 'email', template: 'no_show_notice', to: '={{ $json.client_email }}' }]},
  { id: '9.07', cat: 9, name: 'Waitlist Manager', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'service', 'preferred_date'] }, { t: 'http', name: 'Add to Waitlist', method: 'POST', path: '/api/booking/waitlist' }, { t: 'email', template: 'waitlist_confirmation', to: '={{ $json.email }}' }]},
  { id: '9.08', cat: 9, name: 'Buffer Time Enforcer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['booking_id', 'service_type'] }, { t: 'http', name: 'Check Buffer', method: 'POST', path: '/api/booking/check-buffer' }, { t: 'if', name: 'Buffer Violated?', cond: '={{ $json.buffer_violated === true }}' }, { t: 'http', name: 'Adjust Time', method: 'PATCH', path: '/api/booking/adjust' }]},
  { id: '9.09', cat: 9, name: 'Multi-Staff Smart Scheduler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['service_type', 'preferred_date', 'preferred_time'] }, { t: 'http', name: 'Find Best Staff', method: 'POST', path: '/api/booking/smart-assign' }, { t: 'http', name: 'Create Booking', method: 'POST', path: '/api/booking/create' }, { t: 'email', template: 'booking_with_staff', to: '={{ $json.client_email }}' }]},
  { id: '9.10', cat: 9, name: 'Recurring Appointment Creator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'service', 'frequency', 'start_date'] }, { t: 'http', name: 'Create Recurring', method: 'POST', path: '/api/booking/recurring' }, { t: 'email', template: 'recurring_confirmed', to: '={{ $json.client_email }}' }]},
];

const CAT_10 = [
  { id: '10.01', cat: 10, name: 'Project Template Instantiator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['template_id', 'client_id', 'project_name'] }, { t: 'http', name: 'Create Project', method: 'POST', path: '/api/projects/from-template' }, { t: 'log', activity: 'project_created' }]},
  { id: '10.02', cat: 10, name: 'Task Auto-Assigner', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'task_id'] }, { t: 'http', name: 'Auto-Assign', method: 'POST', path: '/api/tasks/auto-assign' }, { t: 'notify', type: 'task_assigned', msg: '={{ "Task assigned to " + $json.assignee }}' }]},
  { id: '10.03', cat: 10, name: 'Task Due Date Reminder', trigger: 'cron', cron: '0 8 * * *', steps: [{ t: 'http', name: 'Check Due Tasks', method: 'GET', path: '/api/tasks/due-today' }, { t: 'if', name: 'Any Due?', cond: '={{ $json.tasks?.length > 0 }}' }, { t: 'email', template: 'task_due_reminder', to: '={{ $json.assignee_email }}' }]},
  { id: '10.04', cat: 10, name: 'Task Dependency Trigger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['task_id', 'status'] }, { t: 'if', name: 'Completed?', cond: '={{ $json.status === "completed" }}' }, { t: 'http', name: 'Unblock Dependents', method: 'POST', path: '/api/tasks/unblock-dependents' }]},
  { id: '10.05', cat: 10, name: 'Project Milestone Auto-Notify', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'milestone'] }, { t: 'email', template: 'milestone_reached', to: '={{ $json.client_email }}' }, { t: 'log', activity: 'milestone_reached' }]},
  { id: '10.06', cat: 10, name: 'Overdue Task Escalation', trigger: 'cron', cron: '0 10 * * *', steps: [{ t: 'http', name: 'Check Overdue', method: 'GET', path: '/api/tasks/overdue' }, { t: 'if', name: 'Found?', cond: '={{ $json.tasks?.length > 0 }}' }, { t: 'notify', type: 'overdue_tasks', msg: '={{ $json.tasks.length + " overdue task(s)" }}' }]},
  { id: '10.07', cat: 10, name: 'Time Tracking Auto-Start', trigger: 'webhook', steps: [{ t: 'extract', fields: ['task_id', 'user_id'] }, { t: 'http', name: 'Start Timer', method: 'POST', path: '/api/time/start' }, { t: 'log', activity: 'timer_started' }]},
  { id: '10.08', cat: 10, name: 'Weekly Project Status Report', trigger: 'cron', cron: '0 17 * * 5', steps: [{ t: 'http', name: 'Generate Report', method: 'GET', path: '/api/projects/weekly-status' }, { t: 'email', template: 'weekly_project_status', to: '={{ $json.client_email }}' }]},
  { id: '10.09', cat: 10, name: 'Scope Creep Detector', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'new_task', 'original_scope'] }, { t: 'http', name: 'Check Scope', method: 'POST', path: '/api/projects/scope-check' }, { t: 'if', name: 'Creep?', cond: '={{ $json.is_scope_creep === true }}' }, { t: 'notify', type: 'scope_creep', msg: '={{ "Scope creep detected on project: " + $json.project_name }}' }]},
  { id: '10.10', cat: 10, name: 'Project Completion Trigger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id'] }, { t: 'http', name: 'Close Project', method: 'POST', path: '/api/projects/complete' }, { t: 'email', template: 'project_completed', to: '={{ $json.client_email }}' }, { t: 'log', activity: 'project_completed' }]},
];

const CAT_11 = [
  { id: '11.01', cat: 11, name: 'Service Start Notification', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'service', 'start_time'] }, { t: 'email', template: 'service_starting', to: '={{ $json.client_email }}' }, { t: 'sms', msg: '={{ "Your " + $json.service + " service is starting now." }}' }]},
  { id: '11.02', cat: 11, name: 'Progress Photo/Update Auto-Sender', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'photo_url', 'update_text'] }, { t: 'email', template: 'progress_update', to: '={{ $json.client_email }}' }, { t: 'log', activity: 'progress_update_sent' }]},
  { id: '11.03', cat: 11, name: 'Deliverable Upload & Client Notification', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'file_url', 'file_name'] }, { t: 'http', name: 'Store Deliverable', method: 'POST', path: '/api/deliverables/upload' }, { t: 'email', template: 'deliverable_ready', to: '={{ $json.client_email }}' }]},
  { id: '11.04', cat: 11, name: 'Quality Checklist Enforcer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'checklist_results'] }, { t: 'http', name: 'Validate QC', method: 'POST', path: '/api/quality/check' }, { t: 'if', name: 'All Passed?', cond: '={{ $json.all_passed === true }}' }, { t: 'log', activity: 'qc_check', detail: '={{ $json.all_passed ? "PASS" : "FAIL" }}' }]},
  { id: '11.05', cat: 11, name: 'Service Completion Certificate Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'client_name', 'service_type'] }, { t: 'http', name: 'Generate Cert', method: 'POST', path: '/api/documents/certificate' }, { t: 'email', template: 'completion_certificate', to: '={{ $json.client_email }}' }]},
  { id: '11.06', cat: 11, name: 'Post-Service Survey Sender', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'email', 'service'] }, { t: 'email', template: 'post_service_survey', to: '={{ $json.email }}' }, { t: 'log', activity: 'survey_sent' }]},
  { id: '11.07', cat: 11, name: 'SLA Timer & Violation Alert', trigger: 'cron', cron: '*/15 * * * *', steps: [{ t: 'http', name: 'Check SLAs', method: 'GET', path: '/api/sla/check' }, { t: 'if', name: 'Violations?', cond: '={{ $json.violations?.length > 0 }}' }, { t: 'notify', type: 'sla_violation', msg: '={{ $json.violations.length + " SLA violation(s)" }}' }]},
  { id: '11.08', cat: 11, name: 'Revision Request Handler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'revision_notes'] }, { t: 'http', name: 'Create Revision Task', method: 'POST', path: '/api/tasks/create', body: { type: 'revision' } }, { t: 'notify', type: 'revision_request', msg: '={{ "Revision requested on project " + $json.project_id }}' }]},
  { id: '11.09', cat: 11, name: 'Service Hours Utilization Tracker', trigger: 'cron', cron: '0 17 * * 5', steps: [{ t: 'http', name: 'Get Utilization', method: 'GET', path: '/api/reports/utilization' }, { t: 'email', template: 'utilization_report', to: '={{ $json.owner_email }}' }]},
  { id: '11.10', cat: 11, name: 'Automated Quality Score', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id'] }, { t: 'http', name: 'Calculate Score', method: 'POST', path: '/api/quality/score' }, { t: 'log', activity: 'quality_scored', detail: '={{ "Score: " + $json.quality_score }}' }]},
];

const CAT_12 = [
  { id: '12.01', cat: 12, name: 'Transactional Email Sender', trigger: 'webhook', steps: [{ t: 'extract', fields: ['to', 'template', 'data'] }, { t: 'http', name: 'Send Email', method: 'POST', path: '/api/email/send' }, { t: 'log', activity: 'transactional_email' }]},
  { id: '12.02', cat: 12, name: 'Email Template Manager', trigger: 'webhook', steps: [{ t: 'extract', fields: ['template_id', 'action', 'content'] }, { t: 'http', name: 'Manage Template', method: 'POST', path: '/api/email/templates' }, { t: 'log', activity: 'template_managed' }]},
  { id: '12.03', cat: 12, name: 'Email Open/Click Tracker', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email_id', 'event_type', 'link_url'] }, { t: 'http', name: 'Log Event', method: 'POST', path: '/api/analytics/email-event' }, { t: 'log', activity: 'email_tracking' }]},
  { id: '12.04', cat: 12, name: 'Auto-BCC to CRM', trigger: 'webhook', steps: [{ t: 'extract', fields: ['from', 'to', 'subject', 'body_preview'] }, { t: 'http', name: 'Log to CRM', method: 'POST', path: '/api/crm/activities', body: { type: 'email', direction: 'outbound' } }]},
  { id: '12.05', cat: 12, name: 'Unsubscribe/Bounce Handler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'event_type', 'reason'] }, { t: 'http', name: 'Process Event', method: 'POST', path: '/api/email/suppression' }, { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/email-status' }]},
  { id: '12.06', cat: 12, name: 'Email Signature Standardizer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['user_id', 'name', 'title', 'phone'] }, { t: 'http', name: 'Generate Signature', method: 'POST', path: '/api/email/signature' }]},
  { id: '12.07', cat: 12, name: 'Delayed Send Scheduler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['to', 'template', 'send_at'] }, { t: 'http', name: 'Schedule Email', method: 'POST', path: '/api/email/schedule' }, { t: 'log', activity: 'email_scheduled' }]},
  { id: '12.08', cat: 12, name: 'Email Thread Summarizer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['thread_id', 'messages'] }, { t: 'http', name: 'AI Summarize', method: 'POST', path: '/api/ai/parse', body: { type: 'email_summary' } }, { t: 'log', activity: 'thread_summarized' }]},
];

const CAT_13 = [
  { id: '13.01', cat: 13, name: 'Appointment Reminder SMS', trigger: 'cron', cron: '0 */2 * * *', steps: [{ t: 'http', name: 'Get Upcoming', method: 'GET', path: '/api/booking/upcoming?hours=4' }, { t: 'if', name: 'Any?', cond: '={{ $json.appointments?.length > 0 }}' }, { t: 'sms', msg: '={{ "Reminder: You have an appointment in " + $json.hours_until + " hours." }}' }]},
  { id: '13.02', cat: 13, name: 'Two-Way SMS Conversation Logger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['from_phone', 'to_phone', 'message', 'direction'] }, { t: 'http', name: 'Log to CRM', method: 'POST', path: '/api/crm/activities', body: { type: 'sms', direction: '={{ $json.direction }}' } }]},
  { id: '13.03', cat: 13, name: 'SMS Auto-Reply (After Hours)', trigger: 'webhook', steps: [{ t: 'extract', fields: ['from_phone', 'message'] }, { t: 'code', name: 'Check Hours', code: 'const h = new Date().getHours(); return { ...items[0].json, is_after_hours: h < 8 || h >= 18 };' }, { t: 'if', name: 'After Hours?', cond: '={{ $json.is_after_hours === true }}' }, { t: 'sms', msg: '={{ "Thanks for your message! We are currently closed. We will respond first thing in the morning." }}' }]},
  { id: '13.04', cat: 13, name: 'Chat-to-Ticket Converter', trigger: 'webhook', steps: [{ t: 'extract', fields: ['chat_id', 'customer_email', 'transcript'] }, { t: 'http', name: 'Create Ticket', method: 'POST', path: '/api/support/tickets' }, { t: 'email', template: 'ticket_created', to: '={{ $json.customer_email }}' }]},
  { id: '13.05', cat: 13, name: 'Chatbot FAQ Handler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['question', 'session_id'] }, { t: 'http', name: 'AI Answer', method: 'POST', path: '/api/ai/parse', body: { type: 'faq' } }, { t: 'log', activity: 'faq_answered' }]},
  { id: '13.06', cat: 13, name: 'Mass SMS Campaign Sender', trigger: 'webhook', steps: [{ t: 'extract', fields: ['segment_id', 'message', 'scheduled_at'] }, { t: 'http', name: 'Send Campaign', method: 'POST', path: '/api/sms/campaign' }, { t: 'log', activity: 'sms_campaign_sent', detail: '={{ "Segment: " + $json.segment_id }}' }]},
];

const CAT_14 = [
  { id: '14.01', cat: 14, name: 'Call Recording & Storage', trigger: 'webhook', steps: [{ t: 'extract', fields: ['call_id', 'recording_url', 'caller', 'duration'] }, { t: 'http', name: 'Store Recording', method: 'POST', path: '/api/calls/store-recording' }, { t: 'log', activity: 'call_recorded' }]},
  { id: '14.02', cat: 14, name: 'Call Transcription', trigger: 'webhook', steps: [{ t: 'extract', fields: ['call_id', 'recording_url'] }, { t: 'http', name: 'Transcribe', method: 'POST', path: '/api/ai/transcribe' }, { t: 'http', name: 'Store Transcript', method: 'POST', path: '/api/calls/transcript' }]},
  { id: '14.03', cat: 14, name: 'Call Sentiment Analyzer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['call_id', 'transcript'] }, { t: 'http', name: 'Analyze Sentiment', method: 'POST', path: '/api/ai/parse', body: { type: 'sentiment' } }, { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/sentiment' }]},
  { id: '14.04', cat: 14, name: 'Missed Call Auto-Callback', trigger: 'webhook', steps: [{ t: 'extract', fields: ['caller_phone', 'timestamp'] }, { t: 'sms', msg: '={{ "Sorry we missed your call! A team member will call you back shortly, or book a time: " }}' }, { t: 'http', name: 'Create Callback Task', method: 'POST', path: '/api/crm/tasks', body: { type: 'callback', priority: 'high' } }, { t: 'notify', type: 'missed_call', msg: '={{ "Missed call from " + $json.caller_phone }}' }]},
  { id: '14.05', cat: 14, name: 'IVR Menu Builder', trigger: 'webhook', steps: [{ t: 'extract', fields: ['menu_config'] }, { t: 'http', name: 'Configure IVR', method: 'POST', path: '/api/phone/ivr-setup' }, { t: 'log', activity: 'ivr_configured' }]},
  { id: '14.06', cat: 14, name: 'AI Phone Receptionist', trigger: 'webhook', steps: [{ t: 'extract', fields: ['caller_phone', 'call_type'] }, { t: 'http', name: 'AI Handle Call', method: 'POST', path: '/api/ai/phone-receptionist' }, { t: 'log', activity: 'ai_call_handled' }]},
  { id: '14.07', cat: 14, name: 'Call Disposition Logger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['call_id', 'disposition', 'notes'] }, { t: 'http', name: 'Log Disposition', method: 'POST', path: '/api/calls/disposition' }, { t: 'http', name: 'Update CRM', method: 'POST', path: '/api/crm/activities', body: { type: 'call_disposition' } }]},
  { id: '14.08', cat: 14, name: 'Outbound Call Campaign Dialer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['campaign_id', 'contact_list'] }, { t: 'http', name: 'Start Dialer', method: 'POST', path: '/api/phone/campaign-dial' }, { t: 'log', activity: 'dialer_campaign_started' }]},
];

// ─── CATEGORIES 15-20: Finance & Compliance ─────────────────────────────────
const CAT_15 = [
  { id: '15.01', cat: 15, name: 'Auto-Generate Invoice on Service Completion', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'client_id', 'amount'] }, { t: 'http', name: 'Create Invoice', method: 'POST', path: '/api/invoices/create' }, { t: 'email', template: 'invoice_delivery', to: '={{ $json.client_email }}' }, { t: 'log', activity: 'invoice_created' }]},
  { id: '15.02', cat: 15, name: 'Recurring Invoice Generator', trigger: 'cron', cron: '0 6 1 * *', steps: [{ t: 'http', name: 'Generate Recurring', method: 'POST', path: '/api/invoices/generate-recurring' }, { t: 'log', activity: 'recurring_invoices', detail: '={{ $json.count + " invoice(s) generated" }}' }]},
  { id: '15.03', cat: 15, name: 'Time-Based Invoice Calculator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'time_entries'] }, { t: 'http', name: 'Calculate Invoice', method: 'POST', path: '/api/invoices/from-time' }, { t: 'email', template: 'invoice_delivery', to: '={{ $json.client_email }}' }]},
  { id: '15.04', cat: 15, name: 'Expense Pass-Through Invoicer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'expenses'] }, { t: 'http', name: 'Create Expense Invoice', method: 'POST', path: '/api/invoices/expense-passthrough' }, { t: 'email', template: 'expense_invoice', to: '={{ $json.client_email }}' }]},
  { id: '15.05', cat: 15, name: 'Invoice Payment Reminder (Friendly)', trigger: 'cron', cron: '0 9 * * *', steps: [{ t: 'http', name: 'Get Overdue 7d', method: 'GET', path: '/api/invoices/overdue?days=7' }, { t: 'if', name: 'Found?', cond: '={{ $json.invoices?.length > 0 }}' }, { t: 'email', template: 'payment_reminder_friendly', to: '={{ $json.invoices[0].client_email }}' }]},
  { id: '15.06', cat: 15, name: 'Invoice Payment Reminder (Urgent)', trigger: 'cron', cron: '0 9 * * *', steps: [{ t: 'http', name: 'Get Overdue 30d', method: 'GET', path: '/api/invoices/overdue?days=30' }, { t: 'if', name: 'Found?', cond: '={{ $json.invoices?.length > 0 }}' }, { t: 'email', template: 'payment_reminder_urgent', to: '={{ $json.invoices[0].client_email }}' }, { t: 'sms', msg: '={{ "URGENT: Invoice #" + $json.invoices[0].number + " is 30+ days overdue." }}' }]},
  { id: '15.07', cat: 15, name: 'Late Fee Auto-Applier', trigger: 'cron', cron: '0 1 * * *', steps: [{ t: 'http', name: 'Apply Late Fees', method: 'POST', path: '/api/invoices/apply-late-fees' }, { t: 'log', activity: 'late_fees_applied', detail: '={{ $json.count + " late fee(s) applied" }}' }]},
  { id: '15.08', cat: 15, name: 'Invoice Paid Confirmation', trigger: 'webhook', steps: [{ t: 'extract', fields: ['invoice_id', 'amount_paid', 'payment_method'] }, { t: 'email', template: 'invoice_paid_confirmation', to: '={{ $json.client_email }}' }, { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/deals/payment-received' }, { t: 'log', activity: 'payment_received' }]},
  { id: '15.09', cat: 15, name: 'Credit Note Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['invoice_id', 'reason', 'amount'] }, { t: 'http', name: 'Create Credit Note', method: 'POST', path: '/api/invoices/credit-note' }, { t: 'email', template: 'credit_note', to: '={{ $json.client_email }}' }]},
  { id: '15.10', cat: 15, name: 'Tax Calculation & Compliance', trigger: 'webhook', steps: [{ t: 'extract', fields: ['invoice_id', 'line_items', 'client_state'] }, { t: 'http', name: 'Calculate Tax', method: 'POST', path: '/api/billing/calculate-tax' }, { t: 'log', activity: 'tax_calculated' }]},
];

const CAT_16 = [
  { id: '16.01', cat: 16, name: 'Payment Link Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['amount', 'description', 'client_email'] }, { t: 'http', name: 'Create Payment Link', method: 'POST', path: '/api/billing/payment-link' }, { t: 'email', template: 'payment_link', to: '={{ $json.client_email }}' }]},
  { id: '16.02', cat: 16, name: 'Failed Payment Retry', trigger: 'webhook', steps: [{ t: 'extract', fields: ['payment_id', 'customer_id'] }, { t: 'http', name: 'Retry Payment', method: 'POST', path: '/api/billing/retry' }, { t: 'log', activity: 'payment_retry' }]},
  { id: '16.03', cat: 16, name: 'Dunning Email Sequence', trigger: 'webhook', steps: [{ t: 'extract', fields: ['customer_email', 'amount', 'attempt_count'] }, { t: 'email', template: 'dunning_sequence', to: '={{ $json.customer_email }}' }, { t: 'sms', msg: '={{ "Your payment of $" + ($json.amount/100) + " needs attention. Update your card." }}' }]},
  { id: '16.04', cat: 16, name: 'Payment Method Expiry Alert', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Check Expiring Cards', method: 'GET', path: '/api/billing/expiring-cards?days=30' }, { t: 'if', name: 'Found?', cond: '={{ $json.cards?.length > 0 }}' }, { t: 'email', template: 'card_expiring', to: '={{ $json.cards[0].email }}' }]},
  { id: '16.05', cat: 16, name: 'Deposit/Partial Payment Handler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['invoice_id', 'amount', 'payment_type'] }, { t: 'http', name: 'Record Partial', method: 'POST', path: '/api/billing/partial-payment' }, { t: 'email', template: 'partial_payment_received', to: '={{ $json.client_email }}' }]},
  { id: '16.06', cat: 16, name: 'Payment Plan Creator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['invoice_id', 'installments', 'frequency'] }, { t: 'http', name: 'Create Plan', method: 'POST', path: '/api/billing/payment-plan' }, { t: 'email', template: 'payment_plan_created', to: '={{ $json.client_email }}' }]},
  { id: '16.07', cat: 16, name: 'Refund Processor', trigger: 'webhook', steps: [{ t: 'extract', fields: ['payment_id', 'amount', 'reason'] }, { t: 'http', name: 'Process Refund', method: 'POST', path: '/api/billing/refund' }, { t: 'email', template: 'refund_processed', to: '={{ $json.client_email }}' }, { t: 'log', activity: 'refund_processed' }]},
  { id: '16.08', cat: 16, name: 'Revenue Recognition Logger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['invoice_id', 'amount', 'recognition_date'] }, { t: 'http', name: 'Log Revenue', method: 'POST', path: '/api/accounting/revenue-recognition' }, { t: 'log', activity: 'revenue_recognized' }]},
  { id: '16.09', cat: 16, name: 'Multi-Currency Payment Handler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['amount', 'currency', 'client_id'] }, { t: 'http', name: 'Convert & Process', method: 'POST', path: '/api/billing/multi-currency' }, { t: 'log', activity: 'multicurrency_payment' }]},
  { id: '16.10', cat: 16, name: 'Collections Escalation Workflow', trigger: 'cron', cron: '0 9 * * 1', steps: [{ t: 'http', name: 'Check Collections', method: 'GET', path: '/api/invoices/overdue?days=60' }, { t: 'if', name: 'Found?', cond: '={{ $json.invoices?.length > 0 }}' }, { t: 'notify', type: 'collections', msg: '={{ $json.invoices.length + " invoice(s) need collections escalation" }}' }, { t: 'email', template: 'collections_notice', to: '={{ $json.invoices[0].client_email }}' }]},
];

const CAT_17 = [
  { id: '17.01', cat: 17, name: 'Expense Receipt Scanner & Categorizer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['image_url', 'user_id'] }, { t: 'http', name: 'OCR & Categorize', method: 'POST', path: '/api/accounting/receipt-scan' }, { t: 'log', activity: 'receipt_scanned' }]},
  { id: '17.02', cat: 17, name: 'Bank Transaction Categorizer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['transaction_id', 'description', 'amount'] }, { t: 'http', name: 'AI Categorize', method: 'POST', path: '/api/ai/parse', body: { type: 'expense_category' } }, { t: 'log', activity: 'transaction_categorized' }]},
  { id: '17.03', cat: 17, name: 'Monthly P&L Generator', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Generate P&L', method: 'GET', path: '/api/reports/pnl?period=monthly' }, { t: 'email', template: 'monthly_pnl', to: '={{ $json.owner_email }}' }]},
  { id: '17.04', cat: 17, name: 'Quarterly Tax Estimate Calculator', trigger: 'cron', cron: '0 8 1 1,4,7,10 *', steps: [{ t: 'http', name: 'Calculate Estimate', method: 'GET', path: '/api/accounting/tax-estimate' }, { t: 'email', template: 'quarterly_tax_estimate', to: '={{ $json.owner_email }}' }, { t: 'notify', type: 'tax_estimate', msg: '={{ "Q" + $json.quarter + " estimated tax: $" + $json.amount }}' }]},
  { id: '17.05', cat: 17, name: 'Mileage Tracker', trigger: 'webhook', steps: [{ t: 'extract', fields: ['user_id', 'miles', 'purpose', 'date'] }, { t: 'http', name: 'Log Mileage', method: 'POST', path: '/api/accounting/mileage' }, { t: 'log', activity: 'mileage_logged' }]},
  { id: '17.06', cat: 17, name: 'Invoice-to-Payment Reconciler', trigger: 'cron', cron: '0 3 * * *', steps: [{ t: 'http', name: 'Run Reconciliation', method: 'POST', path: '/api/accounting/reconcile' }, { t: 'if', name: 'Discrepancies?', cond: '={{ $json.unmatched?.length > 0 }}' }, { t: 'notify', type: 'reconciliation', msg: '={{ $json.unmatched.length + " unmatched payment(s) found" }}' }]},
  { id: '17.07', cat: 17, name: 'Accounts Receivable Aging Report', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Generate AR Report', method: 'GET', path: '/api/reports/ar-aging' }, { t: 'email', template: 'ar_aging_report', to: '={{ $json.owner_email }}' }]},
  { id: '17.08', cat: 17, name: 'Year-End Tax Document Compiler', trigger: 'cron', cron: '0 8 15 1 *', steps: [{ t: 'http', name: 'Compile Tax Docs', method: 'POST', path: '/api/accounting/year-end-compile' }, { t: 'email', template: 'year_end_tax_docs', to: '={{ $json.owner_email }}' }, { t: 'notify', type: 'year_end_tax', msg: 'Year-end tax documents compiled and ready for review' }]},
];

const CAT_18 = [
  { id: '18.01', cat: 18, name: 'Timesheet Auto-Reminder', trigger: 'cron', cron: '0 16 * * 5', steps: [{ t: 'http', name: 'Get Incomplete', method: 'GET', path: '/api/time/incomplete-timesheets' }, { t: 'if', name: 'Found?', cond: '={{ $json.users?.length > 0 }}' }, { t: 'email', template: 'timesheet_reminder', to: '={{ $json.users[0].email }}' }]},
  { id: '18.02', cat: 18, name: 'Timesheet Approval Workflow', trigger: 'webhook', steps: [{ t: 'extract', fields: ['timesheet_id', 'user_id', 'hours'] }, { t: 'http', name: 'Submit for Approval', method: 'POST', path: '/api/time/submit-approval' }, { t: 'notify', type: 'timesheet_pending', msg: '={{ "Timesheet from " + $json.user_name + " needs approval (" + $json.hours + "h)" }}' }]},
  { id: '18.03', cat: 18, name: 'Contractor Invoice Processor', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contractor_id', 'invoice_amount', 'period'] }, { t: 'http', name: 'Process Invoice', method: 'POST', path: '/api/accounting/contractor-invoice' }, { t: 'log', activity: 'contractor_invoice_processed' }]},
  { id: '18.04', cat: 18, name: 'PTO/Leave Tracker', trigger: 'webhook', steps: [{ t: 'extract', fields: ['user_id', 'leave_type', 'start_date', 'end_date'] }, { t: 'http', name: 'Record Leave', method: 'POST', path: '/api/hr/leave-request' }, { t: 'notify', type: 'leave_request', msg: '={{ $json.user_name + " requested " + $json.leave_type + " from " + $json.start_date }}' }]},
  { id: '18.05', cat: 18, name: 'Team Performance Dashboard Updater', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Update Dashboard', method: 'POST', path: '/api/reports/team-performance' }, { t: 'email', template: 'team_performance', to: '={{ $json.manager_email }}' }]},
  { id: '18.06', cat: 18, name: 'Contractor 1099 Generator', trigger: 'cron', cron: '0 8 15 1 *', steps: [{ t: 'http', name: 'Generate 1099s', method: 'POST', path: '/api/accounting/generate-1099s' }, { t: 'email', template: '1099_ready', to: '={{ $json.owner_email }}' }, { t: 'log', activity: '1099_generated', detail: '={{ $json.count + " 1099(s) generated" }}' }]},
];

const CAT_19 = [
  { id: '19.01', cat: 19, name: 'Job Posting Syndicator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['job_title', 'description', 'location', 'salary_range'] }, { t: 'http', name: 'Syndicate Posting', method: 'POST', path: '/api/hr/syndicate-job' }, { t: 'log', activity: 'job_posted' }]},
  { id: '19.02', cat: 19, name: 'Application Intake & Screening', trigger: 'webhook', steps: [{ t: 'extract', fields: ['applicant_name', 'email', 'resume_url', 'job_id'] }, { t: 'http', name: 'AI Screen', method: 'POST', path: '/api/ai/parse', body: { type: 'resume_screen' } }, { t: 'log', activity: 'application_screened' }]},
  { id: '19.03', cat: 19, name: 'Interview Scheduler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['applicant_email', 'interviewer_id', 'job_id'] }, { t: 'http', name: 'Schedule Interview', method: 'POST', path: '/api/booking/schedule', body: { type: 'interview' } }, { t: 'email', template: 'interview_scheduled', to: '={{ $json.applicant_email }}' }]},
  { id: '19.04', cat: 19, name: 'Rejection Email Auto-Sender', trigger: 'webhook', steps: [{ t: 'extract', fields: ['applicant_email', 'applicant_name', 'job_title'] }, { t: 'email', template: 'application_rejected', to: '={{ $json.applicant_email }}' }, { t: 'log', activity: 'rejection_sent' }]},
  { id: '19.05', cat: 19, name: 'New Hire Onboarding Checklist', trigger: 'webhook', steps: [{ t: 'extract', fields: ['employee_name', 'email', 'role', 'start_date'] }, { t: 'http', name: 'Create Onboarding', method: 'POST', path: '/api/hr/onboarding-checklist' }, { t: 'email', template: 'new_hire_welcome', to: '={{ $json.email }}' }]},
  { id: '19.06', cat: 19, name: 'Employee Document Collector', trigger: 'webhook', steps: [{ t: 'extract', fields: ['employee_id', 'required_docs'] }, { t: 'email', template: 'employee_doc_request', to: '={{ $json.email }}' }, { t: 'log', activity: 'emp_docs_requested' }]},
];

const CAT_20 = [
  { id: '20.01', cat: 20, name: 'Annual Report Filing Reminder', trigger: 'cron', cron: '0 8 1 1,4,7,10 *', steps: [{ t: 'http', name: 'Check Deadlines', method: 'GET', path: '/api/compliance/annual-report-check' }, { t: 'if', name: 'Due Soon?', cond: '={{ $json.due_soon === true }}' }, { t: 'notify', type: 'annual_report', msg: '={{ "Annual report filing due: " + $json.due_date }}' }, { t: 'email', template: 'annual_report_reminder', to: '={{ $json.owner_email }}' }]},
  { id: '20.02', cat: 20, name: 'Business License Renewal Tracker', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Check Licenses', method: 'GET', path: '/api/compliance/license-renewals' }, { t: 'if', name: 'Expiring?', cond: '={{ $json.expiring?.length > 0 }}' }, { t: 'notify', type: 'license_renewal', msg: '={{ $json.expiring.length + " license(s) expiring soon" }}' }]},
  { id: '20.03', cat: 20, name: 'Insurance Policy Expiry Alert', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Check Policies', method: 'GET', path: '/api/compliance/insurance-check' }, { t: 'if', name: 'Expiring?', cond: '={{ $json.expiring?.length > 0 }}' }, { t: 'email', template: 'insurance_expiry_alert', to: '={{ $json.owner_email }}' }]},
  { id: '20.04', cat: 20, name: 'Privacy Policy / Terms Update Notifier', trigger: 'webhook', steps: [{ t: 'extract', fields: ['update_type', 'effective_date'] }, { t: 'http', name: 'Notify All Users', method: 'POST', path: '/api/email/bulk-send', body: { template: 'policy_update' } }, { t: 'log', activity: 'policy_update_sent' }]},
  { id: '20.05', cat: 20, name: 'GDPR/CCPA Data Request Handler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['requester_email', 'request_type'] }, { t: 'http', name: 'Process Request', method: 'POST', path: '/api/compliance/data-request' }, { t: 'email', template: 'data_request_acknowledgment', to: '={{ $json.requester_email }}' }, { t: 'notify', type: 'data_request', msg: '={{ $json.request_type + " request from " + $json.requester_email }}' }]},
  { id: '20.06', cat: 20, name: 'BOI Filing Reminder', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Check BOI Status', method: 'GET', path: '/api/compliance/boi-status' }, { t: 'if', name: 'Action Needed?', cond: '={{ $json.action_needed === true }}' }, { t: 'notify', type: 'boi_filing', msg: '={{ "BOI filing action needed: " + $json.details }}' }]},
  { id: '20.07', cat: 20, name: 'Tax Filing Deadline Tracker', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Check Deadlines', method: 'GET', path: '/api/compliance/tax-deadlines' }, { t: 'if', name: 'Upcoming?', cond: '={{ $json.upcoming?.length > 0 }}' }, { t: 'email', template: 'tax_deadline_reminder', to: '={{ $json.owner_email }}' }]},
  { id: '20.08', cat: 20, name: 'Document Retention Policy Enforcer', trigger: 'cron', cron: '0 2 1 * *', steps: [{ t: 'http', name: 'Check Retention', method: 'POST', path: '/api/compliance/retention-check' }, { t: 'if', name: 'Action Needed?', cond: '={{ $json.documents_to_archive?.length > 0 }}' }, { t: 'http', name: 'Archive Docs', method: 'POST', path: '/api/documents/bulk-archive' }]},
  { id: '20.09', cat: 20, name: 'Compliance Training Tracker', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Check Training', method: 'GET', path: '/api/compliance/training-status' }, { t: 'if', name: 'Overdue?', cond: '={{ $json.overdue?.length > 0 }}' }, { t: 'email', template: 'training_reminder', to: '={{ $json.overdue[0].email }}' }]},
  { id: '20.10', cat: 20, name: 'Entity Status Checker', trigger: 'cron', cron: '0 8 1 1,7 *', steps: [{ t: 'http', name: 'Check Entity Status', method: 'GET', path: '/api/compliance/entity-status' }, { t: 'if', name: 'Issues?', cond: '={{ $json.status !== "good_standing" }}' }, { t: 'notify', type: 'entity_status', msg: '={{ "Entity status: " + $json.status + " — action may be required" }}' }]},
];

// ─── CATEGORIES 21-28: Marketing & Growth ───────────────────────────────────
const CAT_21 = [
  { id: '21.01', cat: 21, name: 'Post-Service Review Request', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'service'] }, { t: 'email', template: 'review_request', to: '={{ $json.email }}' }, { t: 'sms', msg: '={{ "Hi " + $json.name + "! How was your experience? Leave us a review: " }}' }, { t: 'log', activity: 'review_requested' }]},
  { id: '21.02', cat: 21, name: 'Positive Review Thank-You Responder', trigger: 'webhook', steps: [{ t: 'extract', fields: ['reviewer_name', 'rating', 'platform'] }, { t: 'if', name: 'Positive?', cond: '={{ $json.rating >= 4 }}' }, { t: 'http', name: 'Post Reply', method: 'POST', path: '/api/reviews/reply', body: { type: 'thank_you' } }, { t: 'log', activity: 'review_reply_sent' }]},
  { id: '21.03', cat: 21, name: 'Negative Review Alert & Triage', trigger: 'webhook', steps: [{ t: 'extract', fields: ['reviewer_name', 'rating', 'review_text', 'platform'] }, { t: 'if', name: 'Negative?', cond: '={{ $json.rating <= 2 }}' }, { t: 'notify', type: 'negative_review', msg: '={{ "NEGATIVE REVIEW (" + $json.rating + "★) from " + $json.reviewer_name + ": " + $json.review_text?.substring(0, 100) }}' }, { t: 'http', name: 'Create Task', method: 'POST', path: '/api/crm/tasks', body: { type: 'review_triage', priority: 'high' } }]},
  { id: '21.04', cat: 21, name: 'Review Response Drafter', trigger: 'webhook', steps: [{ t: 'extract', fields: ['review_text', 'rating', 'reviewer_name'] }, { t: 'http', name: 'AI Draft Response', method: 'POST', path: '/api/ai/parse', body: { type: 'review_response' } }, { t: 'notify', type: 'review_draft', msg: '={{ "Draft review response ready for " + $json.reviewer_name }}' }]},
  { id: '21.05', cat: 21, name: 'Review Aggregator Dashboard', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Aggregate Reviews', method: 'GET', path: '/api/reviews/aggregate' }, { t: 'email', template: 'review_weekly_digest', to: '={{ $json.owner_email }}' }]},
  { id: '21.06', cat: 21, name: 'Testimonial Collector', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'testimonial_text', 'rating'] }, { t: 'http', name: 'Store Testimonial', method: 'POST', path: '/api/reviews/testimonial' }, { t: 'email', template: 'testimonial_thanks', to: '={{ $json.email }}' }]},
  { id: '21.07', cat: 21, name: 'Review Gating System', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'satisfaction_score'] }, { t: 'if', name: 'Happy?', cond: '={{ $json.satisfaction_score >= 8 }}' }, { t: 'email', template: 'leave_public_review', to: '={{ $json.email }}' }]},
];

const CAT_22 = [
  { id: '22.01', cat: 22, name: 'Support Ticket Auto-Creator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'subject', 'message', 'channel'] }, { t: 'http', name: 'Create Ticket', method: 'POST', path: '/api/support/tickets' }, { t: 'email', template: 'ticket_created_confirmation', to: '={{ $json.email }}' }]},
  { id: '22.02', cat: 22, name: 'Ticket Auto-Categorizer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ticket_id', 'subject', 'message'] }, { t: 'http', name: 'AI Categorize', method: 'POST', path: '/api/ai/parse', body: { type: 'ticket_category' } }, { t: 'http', name: 'Update Ticket', method: 'PATCH', path: '/api/support/tickets/categorize' }]},
  { id: '22.03', cat: 22, name: 'Ticket Priority Auto-Assigner', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ticket_id', 'message', 'client_tier'] }, { t: 'http', name: 'Assign Priority', method: 'POST', path: '/api/support/tickets/auto-priority' }, { t: 'log', activity: 'ticket_prioritized' }]},
  { id: '22.04', cat: 22, name: 'First Response Auto-Acknowledgment', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ticket_id', 'email'] }, { t: 'email', template: 'ticket_acknowledgment', to: '={{ $json.email }}' }, { t: 'log', activity: 'ticket_acknowledged' }]},
  { id: '22.05', cat: 22, name: 'Ticket SLA Breach Alert', trigger: 'cron', cron: '*/15 * * * *', steps: [{ t: 'http', name: 'Check SLAs', method: 'GET', path: '/api/support/tickets/sla-check' }, { t: 'if', name: 'Breaches?', cond: '={{ $json.breaches?.length > 0 }}' }, { t: 'notify', type: 'ticket_sla', msg: '={{ $json.breaches.length + " support ticket SLA breach(es)" }}' }]},
  { id: '22.06', cat: 22, name: 'Canned Response Suggester', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ticket_id', 'message'] }, { t: 'http', name: 'Suggest Response', method: 'POST', path: '/api/ai/parse', body: { type: 'canned_response' } }]},
  { id: '22.07', cat: 22, name: 'Ticket Resolution & Satisfaction Survey', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ticket_id', 'email'] }, { t: 'email', template: 'ticket_resolved_survey', to: '={{ $json.email }}' }, { t: 'log', activity: 'ticket_resolved' }]},
  { id: '22.08', cat: 22, name: 'Recurring Issue Detector', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Analyze Patterns', method: 'GET', path: '/api/support/tickets/pattern-analysis' }, { t: 'if', name: 'Patterns?', cond: '={{ $json.patterns?.length > 0 }}' }, { t: 'notify', type: 'recurring_issues', msg: '={{ $json.patterns.length + " recurring issue pattern(s) detected" }}' }]},
  { id: '22.09', cat: 22, name: 'Escalation Workflow', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ticket_id', 'reason'] }, { t: 'http', name: 'Escalate', method: 'POST', path: '/api/support/tickets/escalate' }, { t: 'notify', type: 'ticket_escalated', msg: '={{ "Ticket " + $json.ticket_id + " escalated: " + $json.reason }}' }]},
  { id: '22.10', cat: 22, name: 'Knowledge Base Article Suggester', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ticket_id', 'message'] }, { t: 'http', name: 'Search KB', method: 'POST', path: '/api/kb/search' }, { t: 'if', name: 'Found?', cond: '={{ $json.articles?.length > 0 }}' }, { t: 'http', name: 'Suggest Article', method: 'POST', path: '/api/support/tickets/suggest-kb' }]},
];

const CAT_23 = [
  { id: '23.01', cat: 23, name: 'Daily Revenue Snapshot', trigger: 'cron', cron: '0 8 * * *', steps: [{ t: 'http', name: 'Get Revenue', method: 'GET', path: '/api/reports/daily-revenue' }, { t: 'notify', type: 'daily_revenue', msg: '={{ "Yesterday revenue: $" + $json.total + " (" + $json.transactions + " txns)" }}' }]},
  { id: '23.02', cat: 23, name: 'Weekly KPI Dashboard Email', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Generate KPIs', method: 'GET', path: '/api/reports/weekly-kpi' }, { t: 'email', template: 'weekly_kpi_dashboard', to: '={{ $json.owner_email }}' }]},
  { id: '23.03', cat: 23, name: 'Monthly Business Report Generator', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Generate Report', method: 'GET', path: '/api/reports/monthly-business' }, { t: 'email', template: 'monthly_business_report', to: '={{ $json.owner_email }}' }]},
  { id: '23.04', cat: 23, name: 'Client-Specific ROI Report', trigger: 'webhook', steps: [{ t: 'extract', fields: ['client_id'] }, { t: 'http', name: 'Calculate ROI', method: 'GET', path: '/api/reports/client-roi' }, { t: 'email', template: 'client_roi_report', to: '={{ $json.client_email }}' }]},
  { id: '23.05', cat: 23, name: 'Lead Source Attribution Report', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get Attribution', method: 'GET', path: '/api/reports/lead-attribution' }, { t: 'email', template: 'lead_attribution', to: '={{ $json.owner_email }}' }]},
  { id: '23.06', cat: 23, name: 'Pipeline Velocity Report', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get Velocity', method: 'GET', path: '/api/reports/pipeline-velocity' }, { t: 'email', template: 'pipeline_velocity', to: '={{ $json.owner_email }}' }]},
  { id: '23.07', cat: 23, name: 'Churn Analysis Report', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Analyze Churn', method: 'GET', path: '/api/reports/churn-analysis' }, { t: 'email', template: 'churn_report', to: '={{ $json.owner_email }}' }]},
  { id: '23.08', cat: 23, name: 'Team Utilization Report', trigger: 'cron', cron: '0 17 * * 5', steps: [{ t: 'http', name: 'Get Utilization', method: 'GET', path: '/api/reports/team-utilization' }, { t: 'email', template: 'team_utilization', to: '={{ $json.manager_email }}' }]},
  { id: '23.09', cat: 23, name: 'Custom Alert Rule Engine', trigger: 'cron', cron: '*/30 * * * *', steps: [{ t: 'http', name: 'Check Alert Rules', method: 'GET', path: '/api/alerts/check-rules' }, { t: 'if', name: 'Triggered?', cond: '={{ $json.triggered?.length > 0 }}' }, { t: 'notify', type: 'custom_alert', msg: '={{ $json.triggered[0].message }}' }]},
  { id: '23.10', cat: 23, name: 'Competitor Pricing Monitor', trigger: 'cron', cron: '0 10 * * 1', steps: [{ t: 'http', name: 'Check Pricing', method: 'GET', path: '/api/intelligence/competitor-pricing' }, { t: 'if', name: 'Changes?', cond: '={{ $json.changes?.length > 0 }}' }, { t: 'email', template: 'competitor_pricing_alert', to: '={{ $json.owner_email }}' }]},
];

const CAT_24 = [
  { id: '24.01', cat: 24, name: 'Blog Post Generator from Topic', trigger: 'webhook', steps: [{ t: 'extract', fields: ['topic', 'keywords', 'tone'] }, { t: 'http', name: 'AI Generate Post', method: 'POST', path: '/api/ai/parse', body: { type: 'blog_post' } }, { t: 'http', name: 'Save Draft', method: 'POST', path: '/api/content/drafts' }, { t: 'notify', type: 'content_draft', msg: '={{ "Blog draft ready: " + $json.topic }}' }]},
  { id: '24.02', cat: 24, name: 'Content Calendar Scheduler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['content_items'] }, { t: 'http', name: 'Schedule Content', method: 'POST', path: '/api/content/calendar' }, { t: 'log', activity: 'content_scheduled' }]},
  { id: '24.03', cat: 24, name: 'Content Repurposer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['content_id', 'target_formats'] }, { t: 'http', name: 'AI Repurpose', method: 'POST', path: '/api/ai/parse', body: { type: 'content_repurpose' } }, { t: 'log', activity: 'content_repurposed' }]},
  { id: '24.04', cat: 24, name: 'Case Study Builder', trigger: 'webhook', steps: [{ t: 'extract', fields: ['client_id', 'project_id', 'results'] }, { t: 'http', name: 'AI Build Case Study', method: 'POST', path: '/api/ai/parse', body: { type: 'case_study' } }, { t: 'http', name: 'Save Draft', method: 'POST', path: '/api/content/drafts' }]},
  { id: '24.05', cat: 24, name: 'Press Release Drafter', trigger: 'webhook', steps: [{ t: 'extract', fields: ['headline', 'details', 'quotes'] }, { t: 'http', name: 'AI Draft PR', method: 'POST', path: '/api/ai/parse', body: { type: 'press_release' } }, { t: 'notify', type: 'press_release', msg: '={{ "Press release draft ready: " + $json.headline }}' }]},
  { id: '24.06', cat: 24, name: 'FAQ Page Auto-Updater', trigger: 'webhook', steps: [{ t: 'extract', fields: ['new_question', 'answer'] }, { t: 'http', name: 'Update FAQ', method: 'POST', path: '/api/content/faq' }, { t: 'log', activity: 'faq_updated' }]},
  { id: '24.07', cat: 24, name: 'Content Performance Tracker', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get Performance', method: 'GET', path: '/api/analytics/content-performance' }, { t: 'email', template: 'content_performance', to: '={{ $json.owner_email }}' }]},
  { id: '24.08', cat: 24, name: 'Lead Magnet Delivery Automator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'magnet_id'] }, { t: 'email', template: 'lead_magnet_delivery', to: '={{ $json.email }}' }, { t: 'crm_contact', source: 'lead_magnet' }]},
];

const CAT_25 = [
  { id: '25.01', cat: 25, name: 'Social Post Scheduler', trigger: 'webhook', steps: [{ t: 'extract', fields: ['content', 'platforms', 'scheduled_at'] }, { t: 'http', name: 'Schedule Post', method: 'POST', path: '/api/social/schedule' }, { t: 'log', activity: 'social_post_scheduled' }]},
  { id: '25.02', cat: 25, name: 'Social Media Comment Monitor', trigger: 'cron', cron: '*/30 * * * *', steps: [{ t: 'http', name: 'Check Comments', method: 'GET', path: '/api/social/comments' }, { t: 'if', name: 'New?', cond: '={{ $json.new_comments?.length > 0 }}' }, { t: 'notify', type: 'social_comment', msg: '={{ $json.new_comments.length + " new social comment(s)" }}' }]},
  { id: '25.03', cat: 25, name: 'User-Generated Content Collector', trigger: 'webhook', steps: [{ t: 'extract', fields: ['content_url', 'platform', 'author'] }, { t: 'http', name: 'Store UGC', method: 'POST', path: '/api/social/ugc' }, { t: 'log', activity: 'ugc_collected' }]},
  { id: '25.04', cat: 25, name: 'Social Proof Screenshot Capture', trigger: 'webhook', steps: [{ t: 'extract', fields: ['url', 'element_selector'] }, { t: 'http', name: 'Capture Screenshot', method: 'POST', path: '/api/tools/screenshot' }, { t: 'log', activity: 'social_proof_captured' }]},
  { id: '25.05', cat: 25, name: 'Hashtag Performance Tracker', trigger: 'cron', cron: '0 10 * * 1', steps: [{ t: 'http', name: 'Get Hashtag Data', method: 'GET', path: '/api/social/hashtag-analytics' }, { t: 'email', template: 'hashtag_report', to: '={{ $json.owner_email }}' }]},
  { id: '25.06', cat: 25, name: 'Auto-Post New Blog Articles', trigger: 'webhook', steps: [{ t: 'extract', fields: ['article_title', 'article_url', 'excerpt'] }, { t: 'http', name: 'Share to Social', method: 'POST', path: '/api/social/auto-share' }, { t: 'log', activity: 'blog_auto_shared' }]},
];

const CAT_26 = [
  { id: '26.01', cat: 26, name: 'Keyword Rank Tracker', trigger: 'cron', cron: '0 6 * * *', steps: [{ t: 'http', name: 'Check Rankings', method: 'GET', path: '/api/seo/rank-check' }, { t: 'if', name: 'Changes?', cond: '={{ $json.changes?.length > 0 }}' }, { t: 'notify', type: 'rank_change', msg: '={{ $json.changes.length + " keyword ranking change(s)" }}' }]},
  { id: '26.02', cat: 26, name: 'Broken Link Detector', trigger: 'cron', cron: '0 3 * * 0', steps: [{ t: 'http', name: 'Scan Links', method: 'GET', path: '/api/seo/broken-links' }, { t: 'if', name: 'Found?', cond: '={{ $json.broken?.length > 0 }}' }, { t: 'email', template: 'broken_links_report', to: '={{ $json.owner_email }}' }]},
  { id: '26.03', cat: 26, name: 'Meta Tag Auditor', trigger: 'cron', cron: '0 4 * * 0', steps: [{ t: 'http', name: 'Audit Meta', method: 'GET', path: '/api/seo/meta-audit' }, { t: 'if', name: 'Issues?', cond: '={{ $json.issues?.length > 0 }}' }, { t: 'email', template: 'meta_audit_report', to: '={{ $json.owner_email }}' }]},
  { id: '26.04', cat: 26, name: 'New Backlink Monitor', trigger: 'cron', cron: '0 7 * * *', steps: [{ t: 'http', name: 'Check Backlinks', method: 'GET', path: '/api/seo/backlinks' }, { t: 'if', name: 'New Found?', cond: '={{ $json.new_backlinks?.length > 0 }}' }, { t: 'notify', type: 'new_backlinks', msg: '={{ $json.new_backlinks.length + " new backlink(s) detected" }}' }]},
  { id: '26.05', cat: 26, name: 'Schema Markup Validator', trigger: 'cron', cron: '0 5 * * 0', steps: [{ t: 'http', name: 'Validate Schema', method: 'GET', path: '/api/seo/schema-validate' }, { t: 'if', name: 'Errors?', cond: '={{ $json.errors?.length > 0 }}' }, { t: 'notify', type: 'schema_errors', msg: '={{ $json.errors.length + " schema markup error(s)" }}' }]},
  { id: '26.06', cat: 26, name: 'Local SEO Citation Builder', trigger: 'webhook', steps: [{ t: 'extract', fields: ['business_name', 'address', 'phone', 'categories'] }, { t: 'http', name: 'Submit Citations', method: 'POST', path: '/api/seo/citations' }, { t: 'log', activity: 'citations_submitted' }]},
  { id: '26.07', cat: 26, name: 'Page Speed Monitor', trigger: 'cron', cron: '0 6 * * 1', steps: [{ t: 'http', name: 'Check Speed', method: 'GET', path: '/api/seo/page-speed' }, { t: 'if', name: 'Slow?', cond: '={{ $json.score < 70 }}' }, { t: 'notify', type: 'page_speed', msg: '={{ "Page speed score: " + $json.score + " — optimization recommended" }}' }]},
  { id: '26.08', cat: 26, name: 'Content Gap Analyzer', trigger: 'cron', cron: '0 9 1 * *', steps: [{ t: 'http', name: 'Analyze Gaps', method: 'GET', path: '/api/seo/content-gaps' }, { t: 'email', template: 'content_gap_report', to: '={{ $json.owner_email }}' }]},
];

const CAT_27 = [
  { id: '27.01', cat: 27, name: 'Google Ads Budget Monitor', trigger: 'cron', cron: '0 */4 * * *', steps: [{ t: 'http', name: 'Check Budget', method: 'GET', path: '/api/ads/budget-check' }, { t: 'if', name: 'Over Budget?', cond: '={{ $json.over_budget === true }}' }, { t: 'notify', type: 'ads_budget', msg: '={{ "Ad spend at " + $json.percent_used + "% of budget" }}' }]},
  { id: '27.02', cat: 27, name: 'Ad Performance Daily Digest', trigger: 'cron', cron: '0 8 * * *', steps: [{ t: 'http', name: 'Get Performance', method: 'GET', path: '/api/ads/daily-performance' }, { t: 'email', template: 'ads_daily_digest', to: '={{ $json.owner_email }}' }]},
  { id: '27.03', cat: 27, name: 'Negative Keyword Harvester', trigger: 'cron', cron: '0 10 * * 1', steps: [{ t: 'http', name: 'Find Negatives', method: 'GET', path: '/api/ads/negative-keywords' }, { t: 'if', name: 'Found?', cond: '={{ $json.suggestions?.length > 0 }}' }, { t: 'notify', type: 'negative_keywords', msg: '={{ $json.suggestions.length + " negative keyword suggestion(s)" }}' }]},
  { id: '27.04', cat: 27, name: 'Ad Creative A/B Test Reporter', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get AB Results', method: 'GET', path: '/api/ads/ab-results' }, { t: 'email', template: 'ad_ab_results', to: '={{ $json.owner_email }}' }]},
  { id: '27.05', cat: 27, name: 'Landing Page A/B Test Rotator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['test_id', 'variants'] }, { t: 'http', name: 'Configure Test', method: 'POST', path: '/api/ads/landing-ab' }, { t: 'log', activity: 'ab_test_configured' }]},
  { id: '27.06', cat: 27, name: 'Retargeting Audience Syncer', trigger: 'cron', cron: '0 2 * * *', steps: [{ t: 'http', name: 'Sync Audiences', method: 'POST', path: '/api/ads/sync-audiences' }, { t: 'log', activity: 'audiences_synced' }]},
  { id: '27.07', cat: 27, name: 'Campaign Pause/Resume Automator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['campaign_id', 'action', 'reason'] }, { t: 'http', name: 'Toggle Campaign', method: 'POST', path: '/api/ads/campaign-toggle' }, { t: 'log', activity: 'campaign_toggled', detail: '={{ $json.action + ": " + $json.reason }}' }]},
];

const CAT_28 = [
  { id: '28.01', cat: 28, name: 'Welcome Email Sequence', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name', 'signup_source'] }, { t: 'http', name: 'Start Welcome Sequence', method: 'POST', path: '/api/sequences/start', body: { sequence: 'welcome' } }, { t: 'log', activity: 'welcome_sequence_started' }]},
  { id: '28.02', cat: 28, name: 'Nurture Sequence by Service Interest', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'service_interest'] }, { t: 'http', name: 'Start Nurture', method: 'POST', path: '/api/sequences/start', body: { sequence: '={{ "nurture_" + $json.service_interest }}' } }]},
  { id: '28.03', cat: 28, name: 'Re-Engagement Campaign', trigger: 'cron', cron: '0 9 1 * *', steps: [{ t: 'http', name: 'Find Disengaged', method: 'GET', path: '/api/email/disengaged?days=60' }, { t: 'if', name: 'Found?', cond: '={{ $json.contacts?.length > 0 }}' }, { t: 'http', name: 'Start Re-Engagement', method: 'POST', path: '/api/sequences/bulk-start', body: { sequence: 're_engagement' } }]},
  { id: '28.04', cat: 28, name: 'Seasonal/Holiday Campaign Launcher', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Check Calendar', method: 'GET', path: '/api/campaigns/seasonal-check' }, { t: 'if', name: 'Campaign Due?', cond: '={{ $json.campaign_due === true }}' }, { t: 'http', name: 'Launch Campaign', method: 'POST', path: '/api/campaigns/launch' }]},
  { id: '28.05', cat: 28, name: 'Newsletter Compiler', trigger: 'cron', cron: '0 10 * * 4', steps: [{ t: 'http', name: 'Compile Newsletter', method: 'POST', path: '/api/content/compile-newsletter' }, { t: 'notify', type: 'newsletter_ready', msg: 'Weekly newsletter compiled and ready for review' }]},
  { id: '28.06', cat: 28, name: 'Email List Hygiene Cleaner', trigger: 'cron', cron: '0 2 1 * *', steps: [{ t: 'http', name: 'Clean List', method: 'POST', path: '/api/email/list-hygiene' }, { t: 'log', activity: 'list_cleaned', detail: '={{ $json.removed_count + " invalid email(s) removed" }}' }]},
  { id: '28.07', cat: 28, name: 'A/B Subject Line Tester', trigger: 'webhook', steps: [{ t: 'extract', fields: ['campaign_id', 'subject_a', 'subject_b', 'test_size'] }, { t: 'http', name: 'Start AB Test', method: 'POST', path: '/api/email/ab-subject' }, { t: 'log', activity: 'subject_ab_started' }]},
  { id: '28.08', cat: 28, name: 'Drip Campaign Builder from Template', trigger: 'webhook', steps: [{ t: 'extract', fields: ['template_id', 'segment_id', 'schedule'] }, { t: 'http', name: 'Build Drip', method: 'POST', path: '/api/campaigns/drip-from-template' }, { t: 'log', activity: 'drip_campaign_created' }]},
];

// ─── CATEGORIES 29-35: Customer Lifecycle ───────────────────────────────────
const CAT_29 = [
  { id: '29.01', cat: 29, name: 'Referral Link Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'email'] }, { t: 'http', name: 'Generate Link', method: 'POST', path: '/api/referrals/generate-link' }, { t: 'email', template: 'referral_link', to: '={{ $json.email }}' }]},
  { id: '29.02', cat: 29, name: 'Referral Conversion Tracker', trigger: 'webhook', steps: [{ t: 'extract', fields: ['referral_code', 'new_customer_email'] }, { t: 'http', name: 'Track Conversion', method: 'POST', path: '/api/referrals/track-conversion' }, { t: 'notify', type: 'referral_conversion', msg: '={{ "Referral converted: " + $json.new_customer_email }}' }]},
  { id: '29.03', cat: 29, name: 'Referral Reward Payout', trigger: 'webhook', steps: [{ t: 'extract', fields: ['referrer_id', 'reward_amount'] }, { t: 'http', name: 'Process Payout', method: 'POST', path: '/api/referrals/payout' }, { t: 'email', template: 'referral_reward', to: '={{ $json.referrer_email }}' }]},
  { id: '29.04', cat: 29, name: 'Partner Performance Report', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Generate Report', method: 'GET', path: '/api/referrals/partner-report' }, { t: 'email', template: 'partner_performance', to: '={{ $json.partner_email }}' }]},
  { id: '29.05', cat: 29, name: 'Referral Request Campaign', trigger: 'cron', cron: '0 10 15 * *', steps: [{ t: 'http', name: 'Find Happy Clients', method: 'GET', path: '/api/crm/contacts/happy-clients' }, { t: 'if', name: 'Found?', cond: '={{ $json.clients?.length > 0 }}' }, { t: 'email', template: 'referral_request', to: '={{ $json.clients[0].email }}' }]},
];

const CAT_30 = [
  { id: '30.01', cat: 30, name: 'Usage-Based Upsell Trigger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'usage_metric', 'threshold'] }, { t: 'if', name: 'Over Threshold?', cond: '={{ $json.usage_metric >= $json.threshold }}' }, { t: 'email', template: 'upsell_suggestion', to: '={{ $json.client_email }}' }, { t: 'notify', type: 'upsell_opportunity', msg: '={{ $json.client_name + " is ready for an upgrade" }}' }]},
  { id: '30.02', cat: 30, name: 'Cross-Sell Recommendation Engine', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'current_services'] }, { t: 'http', name: 'Get Recommendations', method: 'POST', path: '/api/sales/cross-sell-recommend' }, { t: 'email', template: 'cross_sell', to: '={{ $json.client_email }}' }]},
  { id: '30.03', cat: 30, name: 'Annual Review Upsell Package', trigger: 'cron', cron: '0 9 1 * *', steps: [{ t: 'http', name: 'Find Anniversary Clients', method: 'GET', path: '/api/crm/contacts/anniversaries' }, { t: 'if', name: 'Found?', cond: '={{ $json.clients?.length > 0 }}' }, { t: 'email', template: 'annual_review_upsell', to: '={{ $json.clients[0].email }}' }]},
  { id: '30.04', cat: 30, name: 'Abandoned Cart Recovery', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'cart_items', 'cart_total'] }, { t: 'email', template: 'abandoned_cart', to: '={{ $json.email }}' }, { t: 'sms', msg: '={{ "You left items in your cart! Complete your purchase: " }}' }]},
  { id: '30.05', cat: 30, name: 'Service Anniversary Offer', trigger: 'cron', cron: '0 8 * * *', steps: [{ t: 'http', name: 'Check Anniversaries', method: 'GET', path: '/api/crm/contacts/service-anniversaries' }, { t: 'if', name: 'Found?', cond: '={{ $json.contacts?.length > 0 }}' }, { t: 'email', template: 'service_anniversary', to: '={{ $json.contacts[0].email }}' }]},
];

const CAT_31 = [
  { id: '31.01', cat: 31, name: 'Renewal Reminder Sequence', trigger: 'cron', cron: '0 9 * * *', steps: [{ t: 'http', name: 'Check Renewals', method: 'GET', path: '/api/billing/upcoming-renewals?days=30' }, { t: 'if', name: 'Found?', cond: '={{ $json.renewals?.length > 0 }}' }, { t: 'email', template: 'renewal_reminder', to: '={{ $json.renewals[0].email }}' }]},
  { id: '31.02', cat: 31, name: 'At-Risk Client Detector', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Check Health Scores', method: 'GET', path: '/api/crm/contacts/at-risk' }, { t: 'if', name: 'At Risk?', cond: '={{ $json.at_risk?.length > 0 }}' }, { t: 'notify', type: 'at_risk_client', msg: '={{ $json.at_risk.length + " client(s) at risk of churn" }}' }]},
  { id: '31.03', cat: 31, name: 'Win-Back Campaign for Churned Clients', trigger: 'cron', cron: '0 9 1 * *', steps: [{ t: 'http', name: 'Get Churned', method: 'GET', path: '/api/crm/contacts/churned?days=90' }, { t: 'if', name: 'Found?', cond: '={{ $json.contacts?.length > 0 }}' }, { t: 'http', name: 'Start Win-Back', method: 'POST', path: '/api/sequences/bulk-start', body: { sequence: 'win_back' } }]},
  { id: '31.04', cat: 31, name: 'Client Health Score Calculator', trigger: 'cron', cron: '0 3 * * *', steps: [{ t: 'http', name: 'Calculate Scores', method: 'POST', path: '/api/crm/contacts/calculate-health-scores' }, { t: 'log', activity: 'health_scores_updated' }]},
  { id: '31.05', cat: 31, name: 'Loyalty Milestone Celebrator', trigger: 'cron', cron: '0 8 * * *', steps: [{ t: 'http', name: 'Check Milestones', method: 'GET', path: '/api/crm/contacts/loyalty-milestones' }, { t: 'if', name: 'Found?', cond: '={{ $json.milestones?.length > 0 }}' }, { t: 'email', template: 'loyalty_milestone', to: '={{ $json.milestones[0].email }}' }]},
  { id: '31.06', cat: 31, name: 'Service Usage Report for Clients', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Generate Reports', method: 'POST', path: '/api/reports/client-usage' }, { t: 'email', template: 'service_usage_report', to: '={{ $json.client_email }}' }]},
];

const CAT_32 = [
  { id: '32.01', cat: 32, name: 'Cancellation Reason Collector', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'reason', 'feedback'] }, { t: 'http', name: 'Log Reason', method: 'POST', path: '/api/crm/churn-reasons' }, { t: 'log', activity: 'cancellation_reason' }]},
  { id: '32.02', cat: 32, name: 'Cancellation Save Offer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'email', 'reason'] }, { t: 'email', template: 'cancellation_save_offer', to: '={{ $json.email }}' }, { t: 'log', activity: 'save_offer_sent' }]},
  { id: '32.03', cat: 32, name: 'Account Deactivation Processor', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'effective_date'] }, { t: 'http', name: 'Deactivate Account', method: 'POST', path: '/api/accounts/deactivate' }, { t: 'email', template: 'account_deactivated', to: '={{ $json.client_email }}' }]},
  { id: '32.04', cat: 32, name: 'Final Invoice & Data Export', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id'] }, { t: 'http', name: 'Generate Final Invoice', method: 'POST', path: '/api/invoices/final' }, { t: 'http', name: 'Export Data', method: 'POST', path: '/api/accounts/data-export' }, { t: 'email', template: 'final_invoice_and_data', to: '={{ $json.client_email }}' }]},
  { id: '32.05', cat: 32, name: 'Offboarding Feedback Email', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'name'] }, { t: 'email', template: 'offboarding_feedback', to: '={{ $json.email }}' }, { t: 'log', activity: 'offboarding_feedback_sent' }]},
];

// ─── CATEGORIES 33-35: Vendor, Inventory, Documents ─────────────────────────
const CAT_33 = [
  { id: '33.01', cat: 33, name: 'Vendor Invoice Processor', trigger: 'webhook', steps: [{ t: 'extract', fields: ['vendor_id', 'invoice_url', 'amount'] }, { t: 'http', name: 'Process Invoice', method: 'POST', path: '/api/accounting/vendor-invoice' }, { t: 'log', activity: 'vendor_invoice_processed' }]},
  { id: '33.02', cat: 33, name: 'Vendor Contract Expiry Tracker', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Check Vendor Contracts', method: 'GET', path: '/api/vendors/expiring-contracts' }, { t: 'if', name: 'Expiring?', cond: '={{ $json.contracts?.length > 0 }}' }, { t: 'notify', type: 'vendor_contract', msg: '={{ $json.contracts.length + " vendor contract(s) expiring" }}' }]},
  { id: '33.03', cat: 33, name: 'Vendor Performance Scorer', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Score Vendors', method: 'POST', path: '/api/vendors/score' }, { t: 'email', template: 'vendor_scorecard', to: '={{ $json.owner_email }}' }]},
  { id: '33.04', cat: 33, name: 'Purchase Order Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['vendor_id', 'items', 'total'] }, { t: 'http', name: 'Create PO', method: 'POST', path: '/api/vendors/purchase-order' }, { t: 'email', template: 'purchase_order', to: '={{ $json.vendor_email }}' }]},
  { id: '33.05', cat: 33, name: 'Vendor Payment Scheduler', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get Due Payments', method: 'GET', path: '/api/vendors/due-payments' }, { t: 'if', name: 'Due?', cond: '={{ $json.payments?.length > 0 }}' }, { t: 'notify', type: 'vendor_payment', msg: '={{ $json.payments.length + " vendor payment(s) due this week" }}' }]},
];

const CAT_34 = [
  { id: '34.01', cat: 34, name: 'Supply Level Monitor', trigger: 'cron', cron: '0 7 * * *', steps: [{ t: 'http', name: 'Check Levels', method: 'GET', path: '/api/inventory/low-stock' }, { t: 'if', name: 'Low?', cond: '={{ $json.low_stock?.length > 0 }}' }, { t: 'notify', type: 'low_stock', msg: '={{ $json.low_stock.length + " item(s) below reorder threshold" }}' }]},
  { id: '34.02', cat: 34, name: 'Equipment Maintenance Scheduler', trigger: 'cron', cron: '0 7 * * 1', steps: [{ t: 'http', name: 'Check Maintenance', method: 'GET', path: '/api/inventory/maintenance-due' }, { t: 'if', name: 'Due?', cond: '={{ $json.due?.length > 0 }}' }, { t: 'notify', type: 'maintenance_due', msg: '={{ $json.due.length + " equipment item(s) due for maintenance" }}' }]},
  { id: '34.03', cat: 34, name: 'Asset Depreciation Calculator', trigger: 'cron', cron: '0 8 1 1 *', steps: [{ t: 'http', name: 'Calculate Depreciation', method: 'POST', path: '/api/inventory/depreciation' }, { t: 'email', template: 'depreciation_report', to: '={{ $json.owner_email }}' }]},
  { id: '34.04', cat: 34, name: 'License/Subscription Renewal Tracker', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Check Renewals', method: 'GET', path: '/api/inventory/subscription-renewals' }, { t: 'if', name: 'Expiring?', cond: '={{ $json.expiring?.length > 0 }}' }, { t: 'notify', type: 'sub_renewal', msg: '={{ $json.expiring.length + " subscription(s) expiring soon" }}' }]},
  { id: '34.05', cat: 34, name: 'Equipment Checkout/Return Tracker', trigger: 'webhook', steps: [{ t: 'extract', fields: ['equipment_id', 'user_id', 'action'] }, { t: 'http', name: 'Track Equipment', method: 'POST', path: '/api/inventory/checkout' }, { t: 'log', activity: 'equipment_' + '={{ $json.action }}' }]},
];

const CAT_35 = [
  { id: '35.01', cat: 35, name: 'Auto-File Documents by Type', trigger: 'webhook', steps: [{ t: 'extract', fields: ['file_url', 'file_name'] }, { t: 'http', name: 'AI Classify', method: 'POST', path: '/api/ai/parse', body: { type: 'document_classify' } }, { t: 'http', name: 'File Document', method: 'POST', path: '/api/documents/file' }]},
  { id: '35.02', cat: 35, name: 'Document Version Control', trigger: 'webhook', steps: [{ t: 'extract', fields: ['document_id', 'new_version_url', 'change_notes'] }, { t: 'http', name: 'Create Version', method: 'POST', path: '/api/documents/version' }, { t: 'log', activity: 'document_versioned' }]},
  { id: '35.03', cat: 35, name: 'Bulk Document Generator (Mail Merge)', trigger: 'webhook', steps: [{ t: 'extract', fields: ['template_id', 'data_source', 'output_format'] }, { t: 'http', name: 'Generate Docs', method: 'POST', path: '/api/documents/mail-merge' }, { t: 'log', activity: 'mail_merge_completed', detail: '={{ $json.count + " document(s) generated" }}' }]},
  { id: '35.04', cat: 35, name: 'Document Expiry Tracker', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Check Expiring', method: 'GET', path: '/api/documents/expiring?days=30' }, { t: 'if', name: 'Found?', cond: '={{ $json.documents?.length > 0 }}' }, { t: 'notify', type: 'doc_expiry', msg: '={{ $json.documents.length + " document(s) expiring in 30 days" }}' }]},
  { id: '35.05', cat: 35, name: 'OCR & Searchable PDF Converter', trigger: 'webhook', steps: [{ t: 'extract', fields: ['file_url'] }, { t: 'http', name: 'OCR Process', method: 'POST', path: '/api/documents/ocr' }, { t: 'log', activity: 'ocr_processed' }]},
];

// ─── CATEGORIES 36-45: Operations & Meta ────────────────────────────────────
const CAT_36 = [
  { id: '36.01', cat: 36, name: 'Knowledge Base Article Creator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['topic', 'content', 'category'] }, { t: 'http', name: 'Create Article', method: 'POST', path: '/api/kb/articles' }, { t: 'log', activity: 'kb_article_created' }]},
  { id: '36.02', cat: 36, name: 'New Feature Documentation Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['feature_name', 'description'] }, { t: 'http', name: 'AI Generate Docs', method: 'POST', path: '/api/ai/parse', body: { type: 'feature_docs' } }, { t: 'http', name: 'Save to KB', method: 'POST', path: '/api/kb/articles' }]},
  { id: '36.03', cat: 36, name: 'Onboarding Training Sequence', trigger: 'webhook', steps: [{ t: 'extract', fields: ['user_id', 'role'] }, { t: 'http', name: 'Start Training', method: 'POST', path: '/api/training/start-sequence' }, { t: 'email', template: 'training_welcome', to: '={{ $json.email }}' }]},
  { id: '36.04', cat: 36, name: 'SOP Template Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['process_name', 'steps_description'] }, { t: 'http', name: 'AI Generate SOP', method: 'POST', path: '/api/ai/parse', body: { type: 'sop_generator' } }, { t: 'http', name: 'Save SOP', method: 'POST', path: '/api/kb/articles', body: { category: 'sop' } }]},
  { id: '36.05', cat: 36, name: 'Knowledge Base Search Analytics', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get Analytics', method: 'GET', path: '/api/kb/search-analytics' }, { t: 'email', template: 'kb_analytics', to: '={{ $json.owner_email }}' }]},
];

const CAT_37 = [
  { id: '37.01', cat: 37, name: 'Service Quality Audit Checklist', trigger: 'webhook', steps: [{ t: 'extract', fields: ['project_id', 'auditor_id'] }, { t: 'http', name: 'Generate Checklist', method: 'POST', path: '/api/quality/audit-checklist' }, { t: 'log', activity: 'qa_audit_started' }]},
  { id: '37.02', cat: 37, name: 'Client Satisfaction Trend Analyzer', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Analyze Trends', method: 'GET', path: '/api/quality/satisfaction-trends' }, { t: 'email', template: 'satisfaction_trends', to: '={{ $json.owner_email }}' }]},
  { id: '37.03', cat: 37, name: 'Process Compliance Auditor', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Run Audit', method: 'POST', path: '/api/quality/compliance-audit' }, { t: 'if', name: 'Issues?', cond: '={{ $json.issues?.length > 0 }}' }, { t: 'notify', type: 'compliance_issue', msg: '={{ $json.issues.length + " compliance issue(s) found" }}' }]},
  { id: '37.04', cat: 37, name: 'Data Accuracy Checker', trigger: 'cron', cron: '0 3 * * 0', steps: [{ t: 'http', name: 'Check Data', method: 'POST', path: '/api/quality/data-accuracy' }, { t: 'if', name: 'Errors?', cond: '={{ $json.errors?.length > 0 }}' }, { t: 'notify', type: 'data_accuracy', msg: '={{ $json.errors.length + " data accuracy issue(s) found" }}' }]},
  { id: '37.05', cat: 37, name: 'Financial Reconciliation Auditor', trigger: 'cron', cron: '0 4 1 * *', steps: [{ t: 'http', name: 'Run Reconciliation', method: 'POST', path: '/api/quality/financial-reconciliation' }, { t: 'email', template: 'reconciliation_report', to: '={{ $json.owner_email }}' }]},
];

const CAT_38 = [
  { id: '38.01', cat: 38, name: 'Job Dispatch to Nearest Technician', trigger: 'webhook', steps: [{ t: 'extract', fields: ['job_id', 'location', 'service_type'] }, { t: 'http', name: 'Find Nearest', method: 'POST', path: '/api/dispatch/nearest' }, { t: 'sms', msg: '={{ "New job assigned: " + $json.service_type + " at " + $json.location }}', to_owner: true }, { t: 'notify', type: 'job_dispatched', msg: '={{ "Job dispatched to " + $json.technician_name }}' }]},
  { id: '38.02', cat: 38, name: 'Route Optimizer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['technician_id', 'jobs'] }, { t: 'http', name: 'Optimize Route', method: 'POST', path: '/api/dispatch/optimize-route' }, { t: 'sms', msg: '={{ "Optimized route for today: " + $json.stops + " stops, ~" + $json.total_time + " min" }}', to_owner: true }]},
  { id: '38.03', cat: 38, name: 'On-My-Way Notification', trigger: 'webhook', steps: [{ t: 'extract', fields: ['job_id', 'eta_minutes'] }, { t: 'sms', msg: '={{ "Your technician is on the way! ETA: " + $json.eta_minutes + " minutes." }}' }, { t: 'log', activity: 'omw_sent' }]},
  { id: '38.04', cat: 38, name: 'Job Completion Check-In', trigger: 'webhook', steps: [{ t: 'extract', fields: ['job_id', 'technician_id', 'photos', 'notes'] }, { t: 'http', name: 'Log Completion', method: 'POST', path: '/api/dispatch/complete' }, { t: 'email', template: 'job_completed', to: '={{ $json.client_email }}' }]},
  { id: '38.05', cat: 38, name: 'Field Worker Time & Location Logger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['worker_id', 'location', 'action'] }, { t: 'http', name: 'Log Time', method: 'POST', path: '/api/dispatch/time-log' }, { t: 'log', activity: 'field_time_logged' }]},
  { id: '38.06', cat: 38, name: 'Parts/Materials Request from Field', trigger: 'webhook', steps: [{ t: 'extract', fields: ['job_id', 'parts_needed', 'urgency'] }, { t: 'http', name: 'Submit Request', method: 'POST', path: '/api/inventory/parts-request' }, { t: 'notify', type: 'parts_request', msg: '={{ "Parts request from field: " + $json.parts_needed }}' }]},
];

const CAT_39 = [
  { id: '39.01', cat: 39, name: 'Portal Account Provisioner', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'plan'] }, { t: 'http', name: 'Provision Portal', method: 'POST', path: '/api/portal/provision' }, { t: 'email', template: 'portal_credentials', to: '={{ $json.client_email }}' }]},
  { id: '39.02', cat: 39, name: 'Portal SSO Setup', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'sso_provider'] }, { t: 'http', name: 'Configure SSO', method: 'POST', path: '/api/portal/sso-setup' }, { t: 'log', activity: 'sso_configured' }]},
  { id: '39.03', cat: 39, name: 'Self-Service Document Upload', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'document_type', 'file_url'] }, { t: 'http', name: 'Process Upload', method: 'POST', path: '/api/portal/document-upload' }, { t: 'notify', type: 'client_upload', msg: '={{ "Client uploaded: " + $json.document_type }}' }]},
  { id: '39.04', cat: 39, name: 'Self-Service Invoice Viewer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id'] }, { t: 'http', name: 'Get Invoices', method: 'GET', path: '/api/portal/invoices' }]},
  { id: '39.05', cat: 39, name: 'Self-Service Appointment Booker', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'service', 'preferred_time'] }, { t: 'http', name: 'Book Appointment', method: 'POST', path: '/api/booking/create' }, { t: 'email', template: 'appointment_confirmed', to: '={{ $json.client_email }}' }]},
  { id: '39.06', cat: 39, name: 'Self-Service Support Ticket Viewer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id'] }, { t: 'http', name: 'Get Tickets', method: 'GET', path: '/api/portal/tickets' }]},
  { id: '39.07', cat: 39, name: 'Portal Usage Analytics', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get Analytics', method: 'GET', path: '/api/portal/analytics' }, { t: 'email', template: 'portal_analytics', to: '={{ $json.owner_email }}' }]},
];

const CAT_40 = [
  { id: '40.01', cat: 40, name: 'Email Verification on Intake', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email'] }, { t: 'http', name: 'Verify Email', method: 'POST', path: '/api/enrichment/verify-email' }, { t: 'if', name: 'Valid?', cond: '={{ $json.is_valid === true }}' }, { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/email-verified' }]},
  { id: '40.02', cat: 40, name: 'Phone Number Validator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['phone'] }, { t: 'http', name: 'Validate Phone', method: 'POST', path: '/api/enrichment/validate-phone' }, { t: 'log', activity: 'phone_validated' }]},
  { id: '40.03', cat: 40, name: 'Company Enrichment from Domain', trigger: 'webhook', steps: [{ t: 'extract', fields: ['domain'] }, { t: 'http', name: 'Enrich Company', method: 'POST', path: '/api/enrichment/company' }, { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/enrich' }]},
  { id: '40.04', cat: 40, name: 'Social Profile Linker', trigger: 'webhook', steps: [{ t: 'extract', fields: ['contact_id', 'email'] }, { t: 'http', name: 'Find Social Profiles', method: 'POST', path: '/api/enrichment/social-profiles' }, { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/social-links' }]},
  { id: '40.05', cat: 40, name: 'Address Verification & Standardization', trigger: 'webhook', steps: [{ t: 'extract', fields: ['address', 'city', 'state', 'zip'] }, { t: 'http', name: 'Verify Address', method: 'POST', path: '/api/enrichment/verify-address' }, { t: 'http', name: 'Update CRM', method: 'PATCH', path: '/api/crm/contacts/address' }]},
  { id: '40.06', cat: 40, name: 'Reverse IP to Company Identifier', trigger: 'webhook', steps: [{ t: 'extract', fields: ['ip_address', 'page_url'] }, { t: 'http', name: 'Reverse IP Lookup', method: 'POST', path: '/api/enrichment/reverse-ip' }, { t: 'if', name: 'Identified?', cond: '={{ $json.company_name != null }}' }, { t: 'crm_contact', source: 'reverse_ip' }]},
  { id: '40.07', cat: 40, name: 'News Alert for Key Accounts', trigger: 'cron', cron: '0 8 * * *', steps: [{ t: 'http', name: 'Check News', method: 'GET', path: '/api/enrichment/account-news' }, { t: 'if', name: 'News Found?', cond: '={{ $json.articles?.length > 0 }}' }, { t: 'notify', type: 'account_news', msg: '={{ $json.articles.length + " news article(s) about key accounts" }}' }]},
];

const CAT_41 = [
  { id: '41.01', cat: 41, name: 'Failed Login Alert', trigger: 'webhook', steps: [{ t: 'extract', fields: ['email', 'ip_address', 'attempts'] }, { t: 'if', name: 'Excessive?', cond: '={{ $json.attempts >= 5 }}' }, { t: 'notify', type: 'failed_login', msg: '={{ $json.attempts + " failed login attempts from " + $json.ip_address }}' }, { t: 'http', name: 'Lock Account', method: 'POST', path: '/api/security/lock-account' }]},
  { id: '41.02', cat: 41, name: 'Access Permission Audit', trigger: 'cron', cron: '0 3 1 * *', steps: [{ t: 'http', name: 'Run Audit', method: 'GET', path: '/api/security/permission-audit' }, { t: 'if', name: 'Issues?', cond: '={{ $json.issues?.length > 0 }}' }, { t: 'email', template: 'permission_audit', to: '={{ $json.owner_email }}' }]},
  { id: '41.03', cat: 41, name: 'Password Expiry Reminder', trigger: 'cron', cron: '0 8 * * *', steps: [{ t: 'http', name: 'Check Expiring', method: 'GET', path: '/api/security/expiring-passwords?days=7' }, { t: 'if', name: 'Found?', cond: '={{ $json.users?.length > 0 }}' }, { t: 'email', template: 'password_expiry', to: '={{ $json.users[0].email }}' }]},
  { id: '41.04', cat: 41, name: 'API Key Rotation Reminder', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Check Key Ages', method: 'GET', path: '/api/security/api-key-ages' }, { t: 'if', name: 'Old Keys?', cond: '={{ $json.old_keys?.length > 0 }}' }, { t: 'notify', type: 'key_rotation', msg: '={{ $json.old_keys.length + " API key(s) due for rotation" }}' }]},
  { id: '41.05', cat: 41, name: 'SSL Certificate Expiry Monitor', trigger: 'cron', cron: '0 6 * * *', steps: [{ t: 'http', name: 'Check SSL', method: 'GET', path: '/api/security/ssl-check' }, { t: 'if', name: 'Expiring?', cond: '={{ $json.days_remaining < 14 }}' }, { t: 'notify', type: 'ssl_expiry', msg: '={{ "SSL certificate expires in " + $json.days_remaining + " days" }}' }]},
];

const CAT_42 = [
  { id: '42.01', cat: 42, name: 'Uptime Monitor', trigger: 'cron', cron: '*/5 * * * *', steps: [{ t: 'http', name: 'Check Uptime', method: 'GET', path: '/api/monitoring/uptime' }, { t: 'if', name: 'Down?', cond: '={{ $json.is_down === true }}' }, { t: 'notify', type: 'downtime', msg: '={{ "SITE DOWN: " + $json.url + " — " + $json.error }}' }, { t: 'sms', msg: '={{ "ALERT: Your website is down! " + $json.url }}', to_owner: true }]},
  { id: '42.02', cat: 42, name: 'Form Submission Backup', trigger: 'webhook', steps: [{ t: 'extract', fields: ['form_id', 'data'] }, { t: 'http', name: 'Backup Submission', method: 'POST', path: '/api/forms/backup' }, { t: 'log', activity: 'form_backup' }]},
  { id: '42.03', cat: 42, name: 'A/B Test Page Rotator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['test_id', 'visitor_id'] }, { t: 'http', name: 'Get Variant', method: 'POST', path: '/api/ab/assign-variant' }]},
  { id: '42.04', cat: 42, name: 'Exit Intent Popup Trigger', trigger: 'webhook', steps: [{ t: 'extract', fields: ['visitor_id', 'page_url', 'time_on_page'] }, { t: 'http', name: 'Get Popup Config', method: 'POST', path: '/api/website/exit-intent' }]},
  { id: '42.05', cat: 42, name: 'Dynamic Content Personalization', trigger: 'webhook', steps: [{ t: 'extract', fields: ['visitor_id', 'segments'] }, { t: 'http', name: 'Get Personalized Content', method: 'POST', path: '/api/website/personalize' }]},
  { id: '42.06', cat: 42, name: '404 Page Logger & Redirect Creator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['url', 'referrer', 'user_agent'] }, { t: 'http', name: 'Log 404', method: 'POST', path: '/api/website/log-404' }, { t: 'log', activity: '404_logged' }]},
  { id: '42.07', cat: 42, name: 'Sitemap Auto-Updater', trigger: 'cron', cron: '0 4 * * *', steps: [{ t: 'http', name: 'Regenerate Sitemap', method: 'POST', path: '/api/seo/regenerate-sitemap' }, { t: 'http', name: 'Ping Search Engines', method: 'POST', path: '/api/seo/ping-engines' }, { t: 'log', activity: 'sitemap_updated' }]},
];

const CAT_43 = [
  { id: '43.01', cat: 43, name: 'New Entity Filing Assistant', trigger: 'webhook', steps: [{ t: 'extract', fields: ['entity_type', 'state', 'name', 'members'] }, { t: 'http', name: 'Prepare Filing', method: 'POST', path: '/api/compliance/entity-filing' }, { t: 'notify', type: 'entity_filing', msg: '={{ "Entity filing prepared for " + $json.name + " (" + $json.state + ")" }}' }]},
  { id: '43.02', cat: 43, name: 'EIN Application Preparer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['entity_name', 'entity_type', 'responsible_party'] }, { t: 'http', name: 'Prepare EIN App', method: 'POST', path: '/api/compliance/ein-prep' }, { t: 'notify', type: 'ein_prep', msg: '={{ "EIN application prepared for " + $json.entity_name }}' }]},
  { id: '43.03', cat: 43, name: 'Registered Agent Change Processor', trigger: 'webhook', steps: [{ t: 'extract', fields: ['entity_id', 'new_agent', 'state'] }, { t: 'http', name: 'Process Change', method: 'POST', path: '/api/compliance/ra-change' }, { t: 'log', activity: 'ra_change_processed' }]},
  { id: '43.04', cat: 43, name: 'Good Standing Certificate Retriever', trigger: 'webhook', steps: [{ t: 'extract', fields: ['entity_id', 'state'] }, { t: 'http', name: 'Request Certificate', method: 'POST', path: '/api/compliance/good-standing' }, { t: 'notify', type: 'good_standing', msg: '={{ "Good standing certificate requested for " + $json.state }}' }]},
  { id: '43.05', cat: 43, name: 'Operating Agreement Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['entity_name', 'members', 'state'] }, { t: 'http', name: 'AI Generate Agreement', method: 'POST', path: '/api/ai/parse', body: { type: 'operating_agreement' } }, { t: 'notify', type: 'agreement_generated', msg: '={{ "Operating agreement drafted for " + $json.entity_name }}' }]},
];

const CAT_44 = [
  { id: '44.01', cat: 44, name: 'Insurance Quote Request Aggregator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['business_type', 'revenue', 'employees', 'coverage_types'] }, { t: 'http', name: 'Request Quotes', method: 'POST', path: '/api/insurance/quote-request' }, { t: 'notify', type: 'insurance_quotes', msg: 'Insurance quote requests submitted' }]},
  { id: '44.02', cat: 44, name: 'Policy Coverage Gap Analyzer', trigger: 'webhook', steps: [{ t: 'extract', fields: ['current_policies', 'business_type'] }, { t: 'http', name: 'Analyze Gaps', method: 'POST', path: '/api/insurance/gap-analysis' }, { t: 'email', template: 'coverage_gap_report', to: '={{ $json.owner_email }}' }]},
  { id: '44.03', cat: 44, name: 'Certificate of Insurance (COI) Generator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['policy_id', 'recipient', 'project'] }, { t: 'http', name: 'Generate COI', method: 'POST', path: '/api/insurance/generate-coi' }, { t: 'email', template: 'coi_delivery', to: '={{ $json.recipient_email }}' }]},
  { id: '44.04', cat: 44, name: 'Claims Filing Assistant', trigger: 'webhook', steps: [{ t: 'extract', fields: ['policy_id', 'incident_description', 'date', 'amount'] }, { t: 'http', name: 'Prepare Claim', method: 'POST', path: '/api/insurance/prepare-claim' }, { t: 'notify', type: 'insurance_claim', msg: '={{ "Insurance claim prepared: " + $json.incident_description?.substring(0, 80) }}' }]},
];

const CAT_45 = [
  { id: '45.01', cat: 45, name: 'Workflow Error Monitor & Auto-Retry', trigger: 'cron', cron: '*/10 * * * *', steps: [{ t: 'http', name: 'Check Errors', method: 'GET', path: '/api/automation/errors' }, { t: 'if', name: 'Errors?', cond: '={{ $json.errors?.length > 0 }}' }, { t: 'http', name: 'Auto-Retry', method: 'POST', path: '/api/automation/retry' }, { t: 'notify', type: 'workflow_error', msg: '={{ $json.errors.length + " workflow error(s) — auto-retry initiated" }}' }]},
  { id: '45.02', cat: 45, name: 'Workflow Performance Dashboard', trigger: 'cron', cron: '0 8 * * 1', steps: [{ t: 'http', name: 'Get Metrics', method: 'GET', path: '/api/automation/performance' }, { t: 'email', template: 'automation_dashboard', to: '={{ $json.owner_email }}' }]},
  { id: '45.03', cat: 45, name: 'API Rate Limit Manager', trigger: 'cron', cron: '*/5 * * * *', steps: [{ t: 'http', name: 'Check Limits', method: 'GET', path: '/api/automation/rate-limits' }, { t: 'if', name: 'Near Limit?', cond: '={{ $json.near_limit === true }}' }, { t: 'http', name: 'Throttle', method: 'POST', path: '/api/automation/throttle' }]},
  { id: '45.04', cat: 45, name: 'Multi-Tool Failover Router', trigger: 'webhook', steps: [{ t: 'extract', fields: ['service', 'request'] }, { t: 'http', name: 'Route with Failover', method: 'POST', path: '/api/automation/failover-route' }]},
  { id: '45.05', cat: 45, name: 'Scheduled Maintenance Window Manager', trigger: 'webhook', steps: [{ t: 'extract', fields: ['start_time', 'end_time', 'affected_services'] }, { t: 'http', name: 'Set Maintenance', method: 'POST', path: '/api/automation/maintenance-window' }, { t: 'log', activity: 'maintenance_scheduled' }]},
  { id: '45.06', cat: 45, name: 'Data Sync Integrity Checker', trigger: 'cron', cron: '0 4 * * *', steps: [{ t: 'http', name: 'Check Sync', method: 'GET', path: '/api/automation/sync-integrity' }, { t: 'if', name: 'Drift?', cond: '={{ $json.drift_detected === true }}' }, { t: 'notify', type: 'sync_drift', msg: '={{ "Data sync drift detected: " + $json.details }}' }]},
  { id: '45.07', cat: 45, name: 'Webhook Health Monitor', trigger: 'cron', cron: '*/15 * * * *', steps: [{ t: 'http', name: 'Check Webhooks', method: 'GET', path: '/api/automation/webhook-health' }, { t: 'if', name: 'Unhealthy?', cond: '={{ $json.unhealthy?.length > 0 }}' }, { t: 'notify', type: 'webhook_health', msg: '={{ $json.unhealthy.length + " webhook(s) failing" }}' }]},
  { id: '45.08', cat: 45, name: 'Automation ROI Calculator', trigger: 'cron', cron: '0 8 1 * *', steps: [{ t: 'http', name: 'Calculate ROI', method: 'GET', path: '/api/automation/roi' }, { t: 'email', template: 'automation_roi', to: '={{ $json.owner_email }}' }]},
  { id: '45.09', cat: 45, name: 'New Workflow Deployment Pipeline', trigger: 'webhook', steps: [{ t: 'extract', fields: ['workflow_json', 'environment'] }, { t: 'http', name: 'Deploy Workflow', method: 'POST', path: '/api/automation/deploy' }, { t: 'log', activity: 'workflow_deployed' }]},
  { id: '45.10', cat: 45, name: 'AI Agent Task Delegator', trigger: 'webhook', steps: [{ t: 'extract', fields: ['task_description', 'priority', 'context'] }, { t: 'http', name: 'AI Delegate', method: 'POST', path: '/api/ai/delegate-task' }, { t: 'log', activity: 'ai_task_delegated' }]},
];

// ─── MASTER CATALOG ─────────────────────────────────────────────────────────
const ALL_AUTOMATIONS = [
  ...CAT_01, ...CAT_02, ...CAT_03, ...CAT_04, ...CAT_05,
  ...CAT_06, ...CAT_07, ...CAT_08, ...CAT_09, ...CAT_10,
  ...CAT_11, ...CAT_12, ...CAT_13, ...CAT_14, ...CAT_15,
  ...CAT_16, ...CAT_17, ...CAT_18, ...CAT_19, ...CAT_20,
  ...CAT_21, ...CAT_22, ...CAT_23, ...CAT_24, ...CAT_25,
  ...CAT_26, ...CAT_27, ...CAT_28, ...CAT_29, ...CAT_30,
  ...CAT_31, ...CAT_32, ...CAT_33, ...CAT_34, ...CAT_35,
  ...CAT_36, ...CAT_37, ...CAT_38, ...CAT_39, ...CAT_40,
  ...CAT_41, ...CAT_42, ...CAT_43, ...CAT_44, ...CAT_45,
];

// ─── N8N WORKFLOW GENERATOR ─────────────────────────────────────────────────

function expandStep(step, baseUrl, project) {
  const url = (path) => `${baseUrl}${path}`;
  switch (step.t) {
    case 'extract':
      return {
        name: step.name || 'Extract Data',
        type: 'n8n-nodes-base.set', typeVersion: 3.4,
        parameters: { assignments: { assignments: step.fields.map(f => ({ name: f, value: `={{ $json.${f} }}`, type: 'string' })) } }
      };
    case 'http':
      return {
        name: step.name || 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        parameters: {
          method: step.method || 'POST',
          url: url(step.path),
          options: {},
          ...(step.method !== 'GET' ? { sendBody: true, bodyParameters: { parameters: Object.entries(step.body || {}).map(([k, v]) => ({ name: k, value: String(v) })) } } : {})
        }
      };
    case 'email':
      return {
        name: step.name || 'Send Email',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        parameters: {
          method: 'POST', url: url('/api/email/send'), options: {}, sendBody: true,
          bodyParameters: { parameters: [
            { name: 'to', value: step.to || '={{ $json.email }}' },
            { name: 'template', value: step.template },
          ]}
        }
      };
    case 'sms':
      return {
        name: step.name || 'Send SMS',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        parameters: {
          method: 'POST', url: url('/api/sms/send'), options: {}, sendBody: true,
          bodyParameters: { parameters: [
            { name: 'to', value: step.to_owner ? '={{ $json.owner_phone }}' : '={{ $json.phone || $json.caller_phone }}' },
            { name: 'message', value: step.msg },
          ]}
        }
      };
    case 'notify':
      return {
        name: step.name || 'Notify Owner',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        parameters: {
          method: 'POST', url: url('/api/notifications/owner'), options: {}, sendBody: true,
          bodyParameters: { parameters: [
            { name: 'type', value: step.type },
            { name: 'message', value: step.msg },
          ]}
        }
      };
    case 'crm_contact':
      return {
        name: step.name || 'Create/Update CRM Contact',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        parameters: {
          method: 'POST', url: url('/api/crm/contacts'), options: {}, sendBody: true,
          bodyParameters: { parameters: [
            { name: 'email', value: '={{ $json.email || $json.from_email }}' },
            { name: 'name', value: '={{ $json.name || $json.from_name || $json.caller_name || "" }}' },
            { name: 'phone', value: '={{ $json.phone || $json.caller_phone || "" }}' },
            { name: 'source', value: step.source },
            ...(step.extra ? Object.entries(step.extra).map(([k, v]) => ({ name: k, value: v })) : []),
          ]}
        }
      };
    case 'log':
      return {
        name: step.name || 'Log Activity',
        type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
        parameters: {
          method: 'POST', url: url('/api/crm/activities'), options: {}, sendBody: true,
          bodyParameters: { parameters: [
            { name: 'type', value: step.activity },
            { name: 'details', value: step.detail || '={{ JSON.stringify($json) }}' },
          ]}
        }
      };
    case 'if':
      return {
        name: step.name || 'Condition',
        type: 'n8n-nodes-base.if', typeVersion: 2,
        parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ id: 'cond', leftValue: step.cond, rightValue: '', operator: { type: 'boolean', operation: 'true' } }] } }
      };
    case 'code':
      return {
        name: step.name || 'Code',
        type: 'n8n-nodes-base.code', typeVersion: 2,
        parameters: { jsCode: step.code, mode: 'runOnceForEachItem' }
      };
    default:
      return {
        name: step.name || 'Unknown Step',
        type: 'n8n-nodes-base.noOp', typeVersion: 1,
        parameters: {}
      };
  }
}

function buildN8nWorkflow(automation, project, baseUrl) {
  const slug = project.slug || 'app';
  const nodes = [];
  const isWebhook = automation.trigger === 'webhook';

  if (isWebhook) {
    nodes.push({
      parameters: { httpMethod: 'POST', path: `${slug}-${automation.id.replace('.', '-')}`, responseMode: 'responseNode' },
      name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [250, 300], typeVersion: 2
    });
  } else {
    nodes.push({
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: automation.cron || '0 8 * * *' }] } },
      name: 'Schedule', type: 'n8n-nodes-base.scheduleTrigger', position: [250, 300], typeVersion: 1.2
    });
  }

  automation.steps.forEach((step, i) => {
    const expanded = expandStep(step, baseUrl, project);
    expanded.position = [450 + i * 200, 300];
    nodes.push(expanded);
  });

  if (isWebhook) {
    nodes.push({
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, automation: "' + automation.id + '", result: $json }) }}' },
      name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', position: [650 + automation.steps.length * 200, 300], typeVersion: 1.1
    });
  }

  const connections = {};
  for (let i = 0; i < nodes.length - 1; i++) {
    connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
  }

  return {
    name: `${project.name} — ${automation.id} ${automation.name}`,
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    meta: { category: CATEGORIES[automation.cat], automation_id: automation.id }
  };
}

function getAutomationsForProject(archetype, packageOverrides) {
  const packages = packageOverrides || ARCHETYPE_PACKAGES[archetype] || ARCHETYPE_PACKAGES.default;
  const selectedIds = new Set();
  for (const pkg of packages) {
    const ids = PACKAGES[pkg] || [];
    ids.forEach(id => selectedIds.add(id));
  }
  return ALL_AUTOMATIONS.filter(a => selectedIds.has(a.id));
}

function getAutomationsByIds(ids) {
  const idSet = new Set(ids);
  return ALL_AUTOMATIONS.filter(a => idSet.has(a.id));
}

function getAutomationsByCategory(catNumber) {
  return ALL_AUTOMATIONS.filter(a => a.cat === catNumber);
}

module.exports = {
  CATEGORIES,
  PACKAGES,
  ARCHETYPE_PACKAGES,
  ALL_AUTOMATIONS,
  buildN8nWorkflow,
  getAutomationsForProject,
  getAutomationsByIds,
  getAutomationsByCategory,
  expandStep,
};
