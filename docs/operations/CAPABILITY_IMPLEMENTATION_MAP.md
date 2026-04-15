# Capability Implementation Map

**Purpose:** per-capability implementation detail. For each capability that
modules depend on, defines the provider choice, credential model, tenant
binding model, failure modes, fair-use/billing model, and compliance
implications.

**Authority:** modules declare `capabilities_required`; this document defines
what it means for a capability to be "enabled" on a tenant.

**Last updated:** 2026-04-15

---

## Credential model — two classes

Per root `CLAUDE.md`'s third-party credential boundary: every capability is
one of two credential classes.

### Class A: tenant-owned credentials

The customer brings or creates their own vendor account. The launcher stores
an OAuth token or API key bound to that account. Traffic runs on the
customer's vendor. Examples: Stripe Connect, Google Calendar, customer's
email sending domain.

**Default for:** everything that handles customer money, customer PII, or
public-facing identity.

### Class B: launcher-brokered with tenant partition

The launcher uses its own vendor account (e.g. Twilio master account) but
partitions each tenant's resources (number, brand, short-code) so usage and
compliance are isolated. Revocable per tenant without affecting others.

**Default for:** SMS (A2P brand registration takes time), phone-number
tracking, review-scraping APIs.

No capability is brokered without tenant partition. No capability routes
customer live traffic through a launcher-held key pool without this document
explicitly permitting it.

---

## Capability detail blocks

---

### email

**Category:** communication
**Credential class:** A (tenant-owned sending domain)
**Required for:** `webform_autoreply`, `instant_lead_ack`, `after_hours_autoresponder`, `appointment_confirmation`, `appointment_reminder`, `no_show_recovery`, `reschedule_workflow`, `post_job_review_request`, `unhappy_customer_interception`, `invoice_sent_notification`, `overdue_invoice_reminder`, `payment_recovery`, `dormant_customer_reactivation`, `service_due_reminder`, `estimate_followup`, `lost_deal_reactivation`

**Provider choices (ranked):**
1. **Acumbamail** — already in `DYNASTY_TOOL_CONFIG`; EU deliverability strong; first choice.
2. **Resend** — developer-friendly; good US deliverability.
3. **Postmark** — transactional only; extremely reliable; pricier.
4. **AWS SES** — cheapest at scale; more setup.

Single provider per tenant. Tenant picks at wizard time; default is Acumbamail.

**Tenant binding model:**
- Tenant verifies a sending domain they own (DKIM, SPF, DMARC)
- `from_address` must resolve to the verified domain
- Reply-to can be the customer's general inbox

**Capability `enabled` definition:**
- `tenant.capabilities_enabled` contains `email` iff:
  - provider is connected (OAuth or API key present, non-expired)
  - at least one verified sending domain
  - DKIM + SPF + DMARC checks all pass
  - at least one template has rendered successfully in the past 30 days

**Setup wizard:** `wiz_email_connect` — 5 steps:
1. Pick provider
2. Add sending domain
3. Add DNS records (SPF, DKIM, DMARC)
4. Verify DNS (polling loop with 5-minute timeout)
5. Send test email to operator's inbox

**Failure modes:**
- DNS unverified: wiz won't complete; module stays `entitled`
- Domain revoked by provider: capability flips to disabled; all email modules pause
- Bounce rate >10%: alerting fires, modules paused pending operator action
- Unsubscribe-list handling failure: SMS/email both respect a shared suppression list

**Fair use / billing:**
- No per-send metering at MVP (Acumbamail has generous monthly limits)
- Future: tenant pass-through billing if we switch to usage-based provider

**Compliance implications:**
- CAN-SPAM: footer with physical address + unsubscribe link (enforced by `email_footer` compliance flag)
- GDPR: honor suppression list across all modules
- BAA not included in base email; HIPAA tenants must use a BAA-covered provider (Postmark with BAA, or SES with BAA addendum)

---

### sms

**Category:** communication
**Credential class:** B (launcher-brokered, tenant number partition)
**Required for:** `missed_call_textback`, `instant_lead_ack`, `after_hours_autoresponder`, `appointment_confirmation`, `appointment_reminder`, `no_show_recovery`, `reschedule_workflow`, `post_job_review_request`, `overdue_invoice_reminder`, `dormant_customer_reactivation`, `service_due_reminder`, `speed_to_lead_response`, `webform_autoreply`, `invoice_sent_notification`, `lost_deal_reactivation`

**Provider choices (ranked):**
1. **SMS-iT** — already in `DYNASTY_TOOL_CONFIG`; first choice.
2. **Twilio** — fallback; better reporting.
3. **Telnyx** — lower cost at scale.

**Tenant binding model:**
- Launcher provisions (or ports) a dedicated tenant number
- Tenant completes A2P 10DLC brand + campaign registration (takes 1–5 business days)
- Short codes available for Enterprise only

**Capability `enabled` definition:**
- `tenant.capabilities_enabled` contains `sms` iff:
  - tenant has a purchased/ported number assigned
  - A2P brand status is `approved`
  - A2P campaign status is `approved`
  - test-send to operator's phone succeeded within last 24h
  - inbound webhook is receiving messages

**Setup wizard:** `wiz_sms_connect` — 6 steps:
1. Pick provider
2. Search for number by area code
3. Purchase number
4. Submit A2P brand info (operator completes a form that's verbatim passed to provider)
5. Submit campaign — auto-generated from module set
6. Wait for approvals (asynchronous — module stays `entitled` until approvals land)

**Failure modes:**
- A2P rejected: retry wizard with guidance; clear error on which field failed
- Carrier filter: delivery rate drops; alerting fires
- Opt-out: contact-level suppression; enforced globally across all SMS modules
- Quiet hours: suppression by time zone; sends deferred, not skipped

**Fair use / billing:**
- 1,000 outbound SMS/month/tenant included with Core
- $0.02 per SMS overage
- Inbound SMS free (counts toward usage budget only)

**Compliance implications:**
- A2P 10DLC mandatory in US (enforced by `a2p_registered` compliance flag)
- Opt-out: STOP, UNSUBSCRIBE, CANCEL, QUIT, END, OPT OUT all honored (enforced by `sms_opt_out` flag)
- Quiet hours: default 9pm–9am tenant timezone (enforced by `quiet_hours` flag)
- TCPA: never send marketing without prior consent

---

### phone

**Category:** communication
**Credential class:** B (launcher-brokered tracking number + forwarding)
**Required for:** `missed_call_textback`, `speed_to_lead_response`, `voicemail_transcription`

**Provider choices (ranked):**
1. **CallScaler** — already in `DYNASTY_TOOL_CONFIG`; first choice.
2. **Twilio Voice** — fallback.

**Tenant binding model:**
- Tracking number forwards to tenant's real business line
- Missed call webhook fires when forwarded call is not answered
- Voicemail forwarded to launcher → transcription → CRM

**Capability `enabled` definition:**
- `tenant.capabilities_enabled` contains `phone` iff:
  - tracking number assigned
  - forwarding configured + test call succeeded
  - missed-call webhook live
  - voicemail-transcription webhook live (if `voicemail_transcription` activated)

**Setup wizard:** `wiz_phone_connect` — 4 steps:
1. Purchase tracking number
2. Enter forwarding destination
3. Test inbound call
4. Test missed-call webhook

**Failure modes:**
- Forwarding destination wrong: webhook fires but tenant never receives call; operator alert
- Call recording opt-in: two-party-consent states (CA, FL, IL, MD, MA, MT, NV, NH, PA, WA) require in-call disclosure — module ships with provider-level recording disabled by default unless tenant opts in explicitly

**Fair use / billing:**
- 500 inbound minutes/month/tenant included with Core
- $0.04 per minute overage
- Outbound calls not included at launch

**Compliance implications:**
- `call_recording_consent` flag required for modules that record or transcribe
- `pii_minimization` enforced on voicemail transcription (strip card numbers, SSNs)

---

### calendar

**Category:** scheduling
**Credential class:** A (tenant-owned OAuth)
**Required for:** `appointment_confirmation`, `appointment_reminder`, `no_show_recovery`, `reschedule_workflow`

**Provider choices:**
1. **Trafft** — already in `DYNASTY_TOOL_CONFIG`; first for booking flows.
2. **Google Calendar** — OAuth direct.
3. **Microsoft 365** — OAuth direct.
4. **Calendly** — as upstream source only.

**Tenant binding model:**
- Two-way sync: events created in launcher appear on tenant's calendar; events created on tenant's calendar appear in launcher
- Tenant may connect multiple calendars per staff member

**Capability `enabled` definition:**
- OAuth token valid + refresh working
- Two-way sync verified within past 24h
- At least one availability rule defined
- Booking page published (for tenants using launcher booking)

**Setup wizard:** `wiz_calendar_connect` — 3 steps:
1. OAuth provider
2. Map staff to calendars
3. Define business-hours availability rules

**Failure modes:**
- Token expired: refresh; if refresh fails, flip capability to disabled, pause dependent modules
- Timezone mismatch: explicit tenant-level timezone override

**Fair use / billing:** no metered usage

**Compliance implications:**
- Appointment data retained per the module's `downgrade_behavior.data_retention_days`

---

### forms

**Category:** data
**Credential class:** A (native) or A (tenant third-party)
**Required for:** `webform_autoreply`

**Provider choices:**
1. **Native forms** — launcher-built; default.
2. **Typeform, Jotform, Gravity Forms** — integrations.

**Tenant binding model:**
- Native: form lives at tenant-scoped URL; submissions route directly to CRM
- Third-party: tenant adds a webhook URL we provide to their form provider

**Capability `enabled` definition:**
- At least one form published (native) OR webhook receiving (third-party)
- UTM capture live
- Submission routed to CRM in <2s p95

**Setup wizard:** `wiz_forms_setup` — 2 steps for native, 3 for third-party (provider + webhook + test submission).

**Fair use / billing:** no meter.

**Compliance implications:** spam protection (reCAPTCHA or hCaptcha) mandatory on public forms.

---

### crm

**Category:** data
**Credential class:** A (native default)
**Required for:** most modules.

**Provider choices:**
1. **Native CRM** — launcher's shared tenant data spine; default.
2. **SuiteDash** — already in `DYNASTY_TOOL_CONFIG`.
3. **HubSpot / Pipedrive** — integrations; read/write mirror.

**Tenant binding model:**
- Native: nothing to connect.
- External: bidirectional sync with conflict-resolution rules.

**Capability `enabled` definition:**
- Contact / lead / pipeline objects initialized
- Tag taxonomy seeded from blueprint
- At least one contact exists (seed data or imported)

**Setup wizard:** `wiz_crm_init` — runs as part of blueprint provisioning.

**Fair use / billing:** contact-count limits by tier (5k / 25k / 250k per `tiers.json`).

**Compliance implications:** PII stored tenant-scoped; deletion on request honored within 30 days.

---

### estimates

**Category:** commerce
**Credential class:** A (native) or A (third-party)
**Required for:** `estimate_followup`, `proposal_view_tracker`, `lost_deal_reactivation`

**Provider choices:**
1. **Native estimates** — launcher-built.
2. **Documentero** — already in `DYNASTY_TOOL_CONFIG`.
3. **PandaDoc, Jobber** — integrations.

**Tenant binding model:**
- Estimate created in launcher → PDF + view-tracked URL → sent to customer
- View events come back via tracking pixel or provider webhook

**Capability `enabled` definition:**
- At least one estimate template exists
- Send + view webhooks live
- Signature flow verified (if provider supports)

**Setup wizard:** `wiz_estimates_setup` — 3 steps.

**Fair use / billing:** no meter at launch.

**Compliance implications:** e-signature compliance (ESIGN Act) for providers that offer it.

---

### invoicing

**Category:** commerce
**Credential class:** A (tenant's merchant account)
**Required for:** `invoice_sent_notification`, `overdue_invoice_reminder`, `payment_recovery`

**Provider choices:**
1. **Stripe Invoices** — via Stripe Connect (tenant's Stripe account).
2. **SuiteDash Invoices**.
3. **QuickBooks, Xero** — integrations.

**Tenant binding model:**
- Tenant connects their own Stripe (or chosen provider) via OAuth
- Launcher creates invoices on tenant's account; customer pays tenant directly
- Webhook `invoice.paid` flows back to launcher

**Capability `enabled` definition:**
- Provider connected via OAuth
- Test invoice sent + paid in sandbox
- Due-date tracking live
- `invoice.paid` webhook verified

**Setup wizard:** `wiz_invoicing_setup` — 4 steps.

**Fair use / billing:** no launcher-side meter; customer's provider handles transaction fees.

**Compliance implications:** `pci_hand_off` — card data never transits the launcher; Stripe Checkout/Elements only.

---

### reviews

**Category:** content
**Credential class:** A (tenant-owned review destinations)
**Required for:** `post_job_review_request`, `unhappy_customer_interception`

**Provider choices:**
- **Google Business Profile** — primary.
- **Facebook Reviews** — secondary.
- **Yelp, BBB, industry directories** — tertiary.

**Tenant binding model:**
- Tenant provides direct review URLs for each platform
- Happy path: customer redirected to Google review
- Unhappy path: customer redirected to private feedback form

**Capability `enabled` definition:**
- At least Google review URL present
- One alternate link present
- Happy/unhappy path defined (module-level setting)

**Setup wizard:** `wiz_reviews_setup` — 2 steps.

**Fair use / billing:** no meter.

**Compliance implications:** `review_solicitation_policy` — never incentivize reviews in a way that violates Google/Yelp policy.

---

### payments

**Category:** commerce
**Credential class:** A (Stripe Connect preferred)
**Required for:** `payment_recovery`

**Provider choices:**
1. **Stripe Connect** — strongly preferred.
2. **Square, Authorize.Net** — integrations later.

**Tenant binding model:**
- Tenant onboards to Stripe Connect Express
- Launcher never holds raw card data
- Payouts go directly to tenant's bank

**Capability `enabled` definition:**
- Connect account ID on file
- `charges_enabled: true` on Stripe account
- Webhook secret rotated and signed
- Test charge succeeded

**Setup wizard:** `wiz_payments_connect` — 3 steps.

**Fair use / billing:** no launcher-side meter; Stripe's standard fees apply.

**Compliance implications:** `pci_hand_off` hard requirement — enforced by code review, not just policy.

---

## Summary matrix

| Capability | Class | Metered | Setup time | Modules depending | HIPAA-safe default |
|---|---|---|---|---|---|
| email | A | no | 10 min | 16 | no (needs BAA provider) |
| sms | B | 1,000/mo | 1–5 days (A2P) | 15 | no |
| phone | B | 500 min/mo | 15 min | 3 | no |
| calendar | A | no | 5 min | 4 | yes (G-Workspace BAA) |
| forms | A | no | 5 min | 1 | yes (native) |
| crm | A | contact caps by tier | 1 min (native) | most | yes (native) |
| estimates | A | no | 10 min | 3 | n/a |
| invoicing | A | no | 15 min | 3 | n/a |
| reviews | A | no | 5 min | 2 | n/a |
| payments | A | Stripe fees | 20 min | 1 | n/a |

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | Map authored for all 10 capabilities | Claude (drafted), pinohu (owner) |
