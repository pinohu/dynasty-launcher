# Dynasty Empire Automation Catalog - Deployment Guide

## Quick Start

All 14 files (7 categories × 2 files) are production-ready and located in:

```
automations/
├── catalog/
│   ├── n8n-workflows/
│   │   ├── cat16_payment_processing.json
│   │   ├── cat17_bookkeeping.json
│   │   ├── cat18_payroll.json
│   │   ├── cat19_hr_hiring.json
│   │   ├── cat20_compliance.json
│   │   ├── cat21_reputation.json
│   │   └── cat22_customer_support.json
│   └── vercel-api/
│       ├── cat16_payment_processing.js
│       ├── cat17_bookkeeping.js
│       ├── cat18_payroll.js
│       ├── cat19_hr_hiring.js
│       ├── cat20_compliance.js
│       ├── cat21_reputation.js
│       └── cat22_customer_support.js
├── CATALOG_MANIFEST.md
└── DEPLOYMENT_GUIDE.md
```

## Category Overview - Categories 16-22

### Cat 16: Payment Processing (10 automations)
**Focus**: Stripe integration, payment links, dunning sequences, refunds, collections

**Key Features**:
- Exponential backoff retry logic (3 attempts)
- Tiered dunning (soft/firm/urgent)
- Card expiry pre-alerts (30 days)
- Installment plan creation
- Revenue reconciliation

**Integrations**: Stripe, Acumbamail

---

### Cat 17: Bookkeeping & Accounting (8 automations)
**Focus**: Receipt OCR, transaction categorization, tax reporting

**Key Features**:
- Claude 3.5 Sonnet receipt scanning & AI categorization
- Monthly P&L with net profit calculation
- Quarterly tax estimates by business type
- IRS mileage rate deductions
- Year-end document compilation

**Integrations**: Claude AI, Neon PostgreSQL

---

### Cat 18: Payroll & Team Management (6 automations)
**Focus**: Timesheet workflows, contractor invoicing, PTO tracking

**Key Features**:
- Automated timesheet reminders
- Contractor invoice management
- PTO tracking with manager approval
- Performance metric collection
- Commission calculator
- W2/1099 form preparation

**Integrations**: Acumbamail, PostgreSQL

---

### Cat 19: HR & Hiring (6 automations)
**Focus**: Multi-platform job posting, resume screening, onboarding

**Key Features**:
- Job syndication to LinkedIn, Indeed, Glassdoor, ZipRecruiter
- AI resume screening with Claude 3.5 Sonnet matching
- Automated interview scheduling
- New hire onboarding checklists
- Document collection workflow (I-9, W-4, direct deposit)

**Integrations**: Claude AI, Acumbamail, PostgreSQL

---

### Cat 20: Compliance & Legal (10 automations)
**Focus**: Deadline tracking, entity monitoring, regulatory compliance

**Key Features**:
- Annual report deadline tracker
- Business license renewal monitoring
- Insurance policy expiry alerts
- Tax filing deadline calendar
- BOI reporting automation
- GDPR/CCPA data request handling
- Entity status good standing checks
- Training/certification compliance tracking
- Contract compliance monitoring
- Regulatory change alerting

**Integrations**: PostgreSQL, Acumbamail

---

### Cat 21: Reputation & Review Management (7 automations)
**Focus**: Review collection, AI response drafting, sentiment analysis

**Key Features**:
- Post-service automated review requests
- AI-powered response drafting (Claude 3.5 Sonnet)
- Multi-location review consolidation
- Negative review alert system
- Testimonial collection & publishing
- Sentiment trend analysis

**Integrations**: Claude AI, Acumbamail, PostgreSQL

---

### Cat 22: Customer Support & Help Desk (9 automations)
**Focus**: Ticket management, SLA monitoring, escalation workflows

**Key Features**:
- Auto-categorization on ticket creation
- Priority assignment engine
- SLA breach alerting (1/4/8 hour thresholds)
- Escalation workflow (3-tier)
- KB article suggestions
- CSAT survey automation
- First response time tracking
- Ticket deduplication & merging
- Support metrics reporting (closure rate, avg resolution time)

**Integrations**: Claude AI, Acumbamail, PostgreSQL

---

## Environment Variables Required

```bash
# Vercel Deployment
VERCEL_URL=https://your-deployment.vercel.app

# Payment Processing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLIC_KEY=pk_live_...

# Email/Marketing
ACUMBAMAIL_API_KEY=...

# Database
DATABASE_URL=postgresql://user:pass@host/db

# AI/ML
ANTHROPIC_API_KEY=sk-ant-...

# Phone/Voice (optional)
CALLSCALER_API_KEY=...

# SMS (optional)
SMIT_API_KEY=...
```

## Deployment Steps

### 1. Deploy Vercel APIs

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel deploy

# Set environment variables
vercel env add STRIPE_SECRET_KEY
vercel env add ACUMBAMAIL_API_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add DATABASE_URL
```

### 2. Set Up Database

```bash
# Connect to Neon PostgreSQL
psql postgresql://user:pass@host/db

# Run migrations for each category
psql -f migrations/cat16_payment.sql
psql -f migrations/cat17_bookkeeping.sql
psql -f migrations/cat18_payroll.sql
psql -f migrations/cat19_hiring.sql
psql -f migrations/cat20_compliance.sql
psql -f migrations/cat21_reputation.sql
psql -f migrations/cat22_support.sql
```

### 3. Configure n8n

1. Log into n8n dashboard
2. Click "Workflows" → "Import from file"
3. Select `cat16_payment_processing.json`
4. Set credentials:
   - HTTP Header Auth: Bearer token
   - Set base URL to your Vercel deployment
5. Test webhook connectivity
6. Repeat for each category (cat16-cat22)

### 4. Create Webhooks

For each workflow, set up incoming webhooks from:

**Cat 16**: Stripe payment events
```
POST /api/payments/webhook
```

**Cat 17**: Bank transaction feeds, receipt uploads
```
POST /api/bookkeeping/webhook
```

**Cat 18**: Timesheet submissions
```
POST /api/payroll/webhook
```

**Cat 19**: Job applications, interview feedback
```
POST /api/hr/webhook
```

**Cat 20**: Compliance deadline reminders
```
GET /api/compliance/check-deadlines
```

**Cat 21**: Review feed integrations
```
POST /api/reputation/webhook
```

**Cat 22**: Support ticket channels
```
POST /api/support/webhook
```

## Testing

### 1. Test Payment Processing
```bash
curl -X POST https://your-deployment.vercel.app/api/payments/generate-link \
  -H "Content-Type: application/json" \
  -d '{
    "action": "generate-link",
    "amount": 10000,
    "currency": "usd",
    "email": "test@example.com",
    "customerId": "cus_123",
    "description": "Test Invoice"
  }'
```

### 2. Test Bookkeeping
```bash
curl -X POST https://your-deployment.vercel.app/api/bookkeeping/bank-categorization \
  -H "Content-Type: application/json" \
  -d '{
    "action": "bank-categorization",
    "transactionId": "txn_123",
    "amount": 50.00,
    "description": "Office supplies",
    "vendor": "Amazon"
  }'
```

### 3. Test HR/Hiring
```bash
curl -X POST https://your-deployment.vercel.app/api/hr/resume-screening \
  -H "Content-Type: application/json" \
  -d '{
    "action": "resume-screening",
    "resumeUrl": "https://example.com/resume.pdf",
    "jobDescription": "Senior Engineer",
    "candidateEmail": "jane@example.com"
  }'
```

## Monitoring & Maintenance

### Health Checks
- Set up Vercel Function Logs monitoring
- Configure PostgreSQL query performance alerts
- Monitor Claude API usage/costs
- Track Stripe webhook delivery

### Scaling Considerations
- Each workflow is independent and can be scaled separately
- Use PostgreSQL connection pooling for high-volume categories
- Implement rate limiting for Stripe/Acumbamail APIs
- Cache frequently accessed KB articles (Cat 22)

### Backup & Recovery
```bash
# Daily PostgreSQL backups to S3
pg_dump > backup_$(date +%Y%m%d).sql
aws s3 cp backup_*.sql s3://your-bucket/backups/

# Export n8n workflows regularly
n8n export:workflow --output=workflows.json
```

## Cost Estimation (Monthly)

| Component | Estimated Cost |
|-----------|----------------|
| Vercel Functions | $20-100 |
| Neon PostgreSQL | $50-200 |
| Stripe Processing | 2.9% + $0.30/tx |
| Acumbamail | $50-150 |
| Claude API | $50-500 (usage-based) |
| **Total Base** | **$170-950** |

*Actual costs depend on transaction volume, API usage, and data storage.*

## Support & Troubleshooting

### Common Issues

**Issue**: n8n workflow fails to connect to Vercel endpoint
- **Solution**: Check `VERCEL_URL` environment variable, verify Bearer token in HTTP header auth

**Issue**: Stripe payment retry doesn't work
- **Solution**: Verify `STRIPE_SECRET_KEY` is correct, check webhook signatures

**Issue**: Claude AI features return errors
- **Solution**: Verify `ANTHROPIC_API_KEY`, check rate limits

**Issue**: Database connection timeout
- **Solution**: Verify `DATABASE_URL`, check connection pool settings, restart Neon connection

## Production Checklist

- [ ] All environment variables configured
- [ ] Database migrations completed
- [ ] Stripe/Acumbamail API keys validated
- [ ] n8n workflows imported and tested
- [ ] Webhooks configured and active
- [ ] Monitoring and alerting set up
- [ ] Backup strategy implemented
- [ ] SSL/TLS certificates valid
- [ ] Rate limiting enabled
- [ ] Error logging configured
- [ ] Load testing completed
- [ ] Disaster recovery plan documented

## Additional Resources

- n8n Documentation: https://docs.n8n.io
- Vercel Deployment: https://vercel.com/docs
- Neon PostgreSQL: https://neon.tech/docs
- Stripe API: https://stripe.com/docs/api
- Claude API: https://docs.anthropic.com
- Acumbamail API: https://acumbamail.com/api
