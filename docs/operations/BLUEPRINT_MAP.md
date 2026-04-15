# Blueprint Map

**Purpose:** per-vertical defaults that make tenant provisioning a one-click
operation. Each blueprint specifies the modules, templates, messaging tone,
business-hours defaults, KPI dashboard, and upsell path appropriate to the
niche.

**Implementation target:** `api/tenants/create-tenant.js` accepts a
`blueprint_code` and uses this document to materialize the tenant.

**Last updated:** 2026-04-15

---

## Summary: 8 blueprints

| Code | Vertical | Primary personas | Primary pain | Launch-wave recommended modules |
|---|---|---|---|---|
| `plumbing` | Plumbing | owner-operator, office-manager | missed calls during jobs | missed_call_textback, webform_autoreply, appointment_confirmation, post_job_review_request |
| `hvac` | HVAC | owner-operator, office-manager | maintenance recurrence | missed_call_textback, webform_autoreply, appointment_confirmation, appointment_reminder, post_job_review_request |
| `electrical` | Electrical | owner-operator, office-manager | emergency response | missed_call_textback, webform_autoreply, appointment_confirmation, post_job_review_request |
| `cleaning` | Residential/Commercial Cleaning | scheduler, office-manager | no-shows | webform_autoreply, appointment_confirmation, appointment_reminder, no_show_recovery, post_job_review_request |
| `pest-control` | Pest Control | owner-operator, office-manager | recurring service discipline | webform_autoreply, appointment_confirmation, post_job_review_request |
| `med-spa` | Med Spa / Aesthetics | scheduler, regulated-operator | no-shows, public rating | appointment_confirmation, appointment_reminder, no_show_recovery, post_job_review_request |
| `home-remodeling` | Home Remodeling | owner-operator, sales-coordinator | long sales cycle | webform_autoreply, appointment_confirmation, post_job_review_request |
| `auto-detail` | Auto Detailing | scheduler, owner-operator | rebooking | webform_autoreply, appointment_confirmation, appointment_reminder, no_show_recovery, post_job_review_request |

---

## Blueprint detail blocks

---

### plumbing

**File:** `product/blueprints/plumbing.json`

**Default business hours:**
- Mon–Fri 07:00–18:00
- Sat 08:00–14:00
- Sun emergency only

**Default messaging tone:** friendly, direct, trust-forward

**Common services seeded at onboarding:**
- leak repair, water heater, drain cleaning, fixture install, repipe, sewer line

**Typical job types:**
- emergency, scheduled repair, estimate+install, maintenance check

**Seasonal patterns:**
- winter freeze spike, spring sewer backups, summer hose-bib repairs

**Wave 1 recommended modules:**
- missed_call_textback (critical — plumbers miss the most calls)
- webform_autoreply
- appointment_confirmation
- post_job_review_request

**Wave 1 recommended packs:** Lead Capture Pack → Reviews Pack

**Suggested bundle upsell order:**
1. Lead Capture Pack ($49)
2. Scheduling Pack ($49) — after first 30 days
3. Reviews Pack ($35)
4. Billing Pack ($49)
5. Retention Pack ($35)

**Dashboard KPIs:**
- first_response_time_p95
- emergency_response_rate
- avg_review_rating
- days_sales_outstanding

**Template overrides:**
- `tmpl_missed_call_default` → `plumbing_missed_call_v1` (friendly, 24/7 availability mention)
- `tmpl_after_hours_sms` → `plumbing_after_hours_v1`

**Onboarding defaults:**
- Service area: multi-zip
- Emergency hours: yes
- Payment terms: net 15
- Review preferred: Google first

---

### hvac

**File:** `product/blueprints/hvac.json`

**Default business hours:**
- Mon–Fri 07:00–19:00
- Sat 08:00–16:00
- Sun emergency only

**Default messaging tone:** professional, reassuring, comfort-focused

**Common services:**
- AC tuneup, furnace tuneup, install, repair, duct cleaning, IAQ

**Typical job types:**
- emergency, scheduled repair, install bid, maintenance visit

**Seasonal patterns:**
- spring AC prep, fall furnace prep, heat-wave spike, cold-snap spike

**Wave 1 recommended modules:**
- missed_call_textback
- webform_autoreply
- appointment_confirmation
- appointment_reminder
- post_job_review_request

**Wave 2 unlock (killer module):**
- service_due_reminder ← this is what makes HVAC the strongest vertical
- dormant_customer_reactivation

**Wave 1 recommended packs:** Lead Capture Pack + Scheduling Pack

**Suggested bundle upsell order:**
1. Lead Capture Pack
2. Scheduling Pack
3. Reviews Pack
4. Retention Pack ← where HVAC-specific economics shine
5. Billing Pack

**Dashboard KPIs:**
- first_response_time_p95
- maintenance_plan_attach_rate
- seasonal_conversion_rate
- avg_review_rating

**Template overrides:**
- `tmpl_service_due_30` → `hvac_tuneup_due_30` (tune-up-specific copy)
- `tmpl_service_due_14` → `hvac_tuneup_due_14`
- `tmpl_service_due_7` → `hvac_tuneup_due_7`

**Onboarding defaults:**
- Maintenance plan offered: yes
- Seasonal campaigns enabled: yes
- Payment terms: net 0 for repair, net 30 for install

---

### electrical

**File:** `product/blueprints/electrical.json`

**Default business hours:**
- Mon–Fri 07:00–18:00
- Sat 08:00–14:00
- Sun emergency only

**Default messaging tone:** safety-first, licensed-and-insured forward, plainspoken

**Common services:**
- panel upgrade, service call, EV charger install, lighting, generator, rewire, inspection repair

**Typical job types:**
- emergency, scheduled repair, estimate+install, permit inspection

**Seasonal patterns:**
- storm-season outage spike, holiday lighting, winter generator demand

**Wave 1 recommended modules:**
- missed_call_textback
- webform_autoreply
- appointment_confirmation
- post_job_review_request

**Wave 1 recommended packs:** Lead Capture Pack → Reviews Pack

**Dashboard KPIs:**
- first_response_time_p95
- emergency_response_rate
- avg_review_rating
- days_sales_outstanding

**Onboarding defaults:**
- License info captured (displayed in emails)
- Insurance info captured
- Emergency hours: yes

---

### cleaning

**File:** `product/blueprints/cleaning.json`

**Default business hours:**
- Mon–Fri 07:00–18:00
- Sat 08:00–14:00
- Sun closed

**Default messaging tone:** warm, respectful, detail-oriented

**Common services:**
- recurring residential, deep clean, move in/out, commercial nightly, post-construction

**Typical job types:**
- recurring, one-time, move in/out, commercial contract

**Seasonal patterns:**
- spring cleaning, holiday prep, summer move season

**Wave 1 recommended modules:**
- webform_autoreply
- appointment_confirmation
- appointment_reminder
- no_show_recovery ← critical for cleaning
- post_job_review_request

**Wave 2 unlock:**
- dormant_customer_reactivation
- service_due_reminder (for recurring cadence reminders)

**Wave 1 recommended packs:** Scheduling Pack + Reviews Pack

**Dashboard KPIs:**
- recurring_retention_rate
- no_show_rate
- review_capture_rate
- payment_failure_recovery

**Template overrides:**
- `tmpl_appt_reminder_24h` → `cleaning_reminder_24h`
- `tmpl_dormant_6` → `cleaning_dormant_6mo`

**Onboarding defaults:**
- Recurring cadence: weekly / biweekly / monthly
- Access notes field: yes
- Key/code management: in-tenant notes

---

### pest-control

**File:** `product/blueprints/pest-control.json`

**Default business hours:**
- Mon–Fri 07:00–18:00
- Sat 08:00–14:00
- Sun closed

**Default messaging tone:** reassuring, science-lite, family-safe

**Common services:**
- quarterly general pest, mosquito, termite inspection, rodent, WDI/WDO letters, commercial contract

**Typical job types:**
- recurring service, one-time treatment, inspection, emergency infestation

**Seasonal patterns:**
- spring mosquito, fall rodent, termite swarm

**Wave 1 recommended modules:**
- webform_autoreply
- appointment_confirmation
- post_job_review_request

**Wave 2 unlock (second killer vertical for retention):**
- service_due_reminder (quarterly cadence)
- dormant_customer_reactivation

**Wave 1 recommended packs:** Scheduling Pack + Reviews Pack
**Wave 2 unlock:** Retention Pack

**Dashboard KPIs:**
- recurring_plan_attach_rate
- service_due_conversion
- avg_review_rating

**Template overrides:**
- `tmpl_service_due_30` → `pest_quarterly_due_30`
- `tmpl_service_due_14` → `pest_quarterly_due_14`

---

### med-spa

**File:** `product/blueprints/med-spa.json`

**Default business hours:**
- Mon–Sat 10:00–19:00
- Sun closed

**Default messaging tone:** aspirational, discreet, knowledgeable

**Common services:**
- injectables, laser, facials, body contouring, membership programs

**Typical job types:**
- consultation, treatment appointment, package treatment, membership visit

**Seasonal patterns:**
- pre-wedding season, pre-holiday glow, summer hair removal

**Wave 1 recommended modules:**
- appointment_confirmation
- appointment_reminder ← critical, appointment-dense
- no_show_recovery ← critical
- post_job_review_request
- unhappy_customer_interception (after W1 review-request goes live)

**Wave 2 unlock:**
- dormant_customer_reactivation
- service_due_reminder
- payment_recovery (membership billing)

**HIPAA gate:** med-spa tenants doing injectables require the HIPAA add-on.
Blueprint provisioning must prompt for HIPAA mode at onboarding.

**Wave 1 recommended packs:** Scheduling Pack + Reviews Pack

**Dashboard KPIs:**
- no_show_rate
- membership_retention_rate
- avg_public_rating
- failed_payment_recovery_rate

**Template overrides:**
- `tmpl_appt_reminder_24h` → `medspa_reminder_24h`
- `tmpl_review_request_sms` → `medspa_review_sms`
- `tmpl_dormant_6` → `medspa_dormant_6mo`

**Onboarding defaults:**
- HIPAA add-on prompted: yes (for injectables)
- Consent capture enabled
- Recording/disclosure defaults

---

### home-remodeling

**File:** `product/blueprints/home-remodeling.json`

**Default business hours:**
- Mon–Fri 08:00–18:00
- Sat 09:00–13:00
- Sun closed

**Default messaging tone:** considered, design-sensitive, trust-forward

**Common services:**
- kitchen remodel, bath remodel, addition, basement finish, whole home, design consultation

**Typical job types:**
- consultation, design phase, build phase, change order, punch list

**Seasonal patterns:**
- January planning surge, spring build start, summer outdoor push, Q4 permit rush

**Wave 1 recommended modules:**
- webform_autoreply
- appointment_confirmation
- post_job_review_request

**Wave 2 unlock:**
- estimate_followup ← critical (long sales cycle)
- proposal_view_tracker ← critical
- lost_deal_reactivation

**Wave 1 recommended packs:** Lead Capture Pack + Reviews Pack + Billing Pack

**Dashboard KPIs:**
- estimate_close_rate
- time_to_decision
- proposal_view_to_close_rate
- days_sales_outstanding

**Onboarding defaults:**
- Estimate templates preloaded
- Milestone billing enabled
- Change-order workflow enabled

---

### auto-detail

**File:** `product/blueprints/auto-detail.json`

**Default business hours:**
- Mon–Sat 08:00–18:00
- Sun closed

**Default messaging tone:** enthusiastic, car-enthusiast-aware, appointment-first

**Common services:**
- exterior detail, interior detail, full detail, ceramic coating, paint correction, headlight restore

**Typical job types:**
- one-time detail, recurring maintenance, ceramic package, fleet contract

**Seasonal patterns:**
- spring salt removal, summer convertible prep, pre-holiday gifting

**Wave 1 recommended modules:**
- webform_autoreply
- appointment_confirmation
- appointment_reminder
- no_show_recovery
- post_job_review_request

**Wave 2 unlock:**
- dormant_customer_reactivation (rebook at 90/180 days)

**Wave 1 recommended packs:** Scheduling Pack + Reviews Pack

**Dashboard KPIs:**
- no_show_rate
- rebook_rate
- avg_review_rating
- ceramic_attach_rate

---

## Blueprint provisioning contract

When `create-tenant.js` receives a `blueprint_code`, it must:

1. Read the blueprint JSON from `product/blueprints/`
2. Create the tenant record with defaults: timezone, locale, business hours
3. Seed the CRM with empty contact/lead/job objects + tag taxonomy
4. Install default templates (blueprint overrides first, then platform defaults)
5. Create entitlement rows for the recommended modules included in the
   chosen Edition (the edition maps to the customer's Stripe subscription)
6. Launch capability setup wizards for every capability the recommended
   modules declare as required
7. On wizard completion, run standard activation flow per module

No step may page a human operator.

---

## Change log

| Date | Change | By |
|---|---|---|
| 2026-04-15 | 8 blueprints detailed with wave assignments + KPIs + template overrides | Claude (drafted), pinohu (owner) |
