# Dynasty Empire Automation Catalog - Categories 16-22

Generated: 2026-04-16

## File Structure

All files are located in:
- n8n-workflows/: n8n workflow JSON configurations
- vercel-api/: Next.js API endpoint implementations

## Categories Generated

### Category 16: Payment Processing (10 automations)
- **n8n Workflow**: `cat16_payment_processing.json`
- **Vercel API**: `cat16_payment_processing.js`
- **Automations**:
  1. Instant payment link generator (Stripe Payment Links)
  2. Failed payment retry (3x exponential backoff)
  3. Dunning email sequence (soft→firm→urgent)
  4. Card expiry alert (30 days before)
  5. Deposit/partial payment handler
  6. Installment plan manager
  7. Refund processing automation
  8. Collections workflow (60+ days overdue)
  9. Payment method update request
  10. Revenue reconciliation reporter

### Category 17: Bookkeeping & Accounting (8 automations)
- **n8n Workflow**: `cat17_bookkeeping.json`
- **Vercel API**: `cat17_bookkeeping.js`
- **Automations**:
  1. Receipt scanning and categorization (Claude 3.5 Sonnet OCR+AI)
  2. Bank transaction auto-categorization
  3. Monthly P&L generation
  4. Quarterly tax estimate calculator
  5. Mileage logging automation (IRS standard rates)
  6. Year-end tax document compilation
  7. Expense report generator
  8. Chart of accounts sync

### Category 18: Payroll & Team Management (6 automations)
- **n8n Workflow**: `cat18_payroll.json`
- **Vercel API**: `cat18_payroll.js`
- **Automations**:
  1. Timesheet reminder and approval workflow
  2. Contractor invoice processing
  3. PTO request and tracking
  4. Performance dashboard data collector
  5. Commission calculator
  6. 1099/W2 preparation helper

### Category 19: HR & Hiring (6 automations)
- **n8n Workflow**: `cat19_hr_hiring.json`
- **Vercel API**: `cat19_hr_hiring.js`
- **Automations**:
  1. Job posting syndication (LinkedIn, Indeed, Glassdoor, ZipRecruiter)
  2. Resume screening with AI ranking (Claude 3.5 Sonnet)
  3. Interview scheduling automation
  4. Rejection notification sender
  5. New hire onboarding checklist
  6. Document collection (I-9, W-4, direct deposit)

### Category 20: Compliance & Legal (10 automations)
- **n8n Workflow**: `cat20_compliance.json`
- **Vercel API**: `cat20_compliance.js`
- **Automations**:
  1. Annual report deadline tracker
  2. Business license renewal monitor
  3. Insurance policy expiry alerts
  4. Tax filing deadline calendar
  5. BOI (Beneficial Ownership) reporting automation
  6. GDPR/CCPA data request handler
  7. Entity status monitoring (good standing checks)
  8. Training compliance tracker (certifications, safety)
  9. Contract compliance monitor
  10. Regulatory change alerting

### Category 21: Reputation & Review Management (7 automations)
- **n8n Workflow**: `cat21_reputation.json`
- **Vercel API**: `cat21_reputation.js`
- **Automations**:
  1. Automated review request (post-service)
  2. Review response drafter (AI-powered with Claude)
  3. Review aggregation dashboard
  4. Negative review alert system
  5. Testimonial collection and publishing
  6. Multi-location review consolidation
  7. Review sentiment trend analyzer

### Category 22: Customer Support & Help Desk (9 automations)
- **n8n Workflow**: `cat22_customer_support.json`
- **Vercel API**: `cat22_customer_support.js`
- **Automations**:
  1. Ticket creation and auto-categorization
  2. Priority assignment engine
  3. SLA breach alerting
  4. Escalation workflow (tier 1→2→3)
  5. Knowledge base article suggestion
  6. CSAT survey after resolution
  7. First response time tracker
  8. Ticket merge and deduplication
  9. Support metrics reporter

## Tech Stack

- **Workflow Orchestration**: n8n
- **API Framework**: Next.js (Vercel)
- **Database**: Neon PostgreSQL
- **Payment Processing**: Stripe
- **Email/Marketing**: Acumbamail
- **SMS**: SMS-iT
- **Phone/Voice**: CallScaler
- **Scheduling**: Trafft
- **AI/ML**: Anthropic Claude 3.5 Sonnet

## Implementation Notes

### n8n Workflows
- HTTP Request nodes configured for Vercel API endpoints
- Environment variables: `VERCEL_URL`, `STRIPE_API_KEY`, `ACUMBAMAIL_API_KEY`
- JSON request bodies with n8n expression syntax for dynamic data
- Ready to import directly into n8n dashboard

### Vercel API Endpoints
- TypeScript/Next.js 14+ compatible
- POST endpoint handling multiple actions via switch statement
- Neon PostgreSQL integration using `@vercel/postgres`
- Anthropic Claude 3.5 Sonnet for AI-powered features
- Error handling and JSON response format standardized
- CORS-ready for frontend integration

## Database Schema Requirements

Each category requires associated tables (auto-created via migrations):
- `support_tickets`, `csat_surveys`, `frt_metrics` (cat22)
- `transactions`, `receipts`, `invoices`, `mileage_log` (cat17)
- `payroll`, `contractor_invoices`, `pto_requests` (cat18)
- `candidates`, `interviews`, `onboarding` (cat19)
- `compliance_deadlines`, `business_licenses`, `contracts` (cat20)
- `reviews`, `testimonials`, `consolidated_reviews` (cat21)
- `payment_intents`, `installments`, `refunds` (cat16)

## Deployment

1. Deploy Vercel API endpoints to Vercel platform
2. Configure environment variables in Vercel project settings
3. Import n8n workflows via dashboard or API
4. Set up database migrations for required tables
5. Configure webhooks and integrations for external services

## Total Deliverables

- 7 categories (16-22)
- 14 files total (7 n8n + 7 Vercel API)
- 56 automation functions
- Production-quality code with error handling
- Full AI/ML integration capabilities
