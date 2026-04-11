# Diagnostic + Checkout Analytics Schema

This document defines the event schema wired through `/api/telemetry`.

## Event transport

- Client endpoint: `/api/telemetry`
- Server forwarder: `api/telemetry.js`
- Optional destination: PostHog via `POSTHOG_API_KEY` and `POSTHOG_HOST`
- If PostHog key is missing, events are accepted and no-op forwarded

## Distinct IDs

- Quiz flow uses `dynasty_diag_session_id` in localStorage
- App flow reuses `dynasty_diag_session_id` when available
- Fallback in app: `dynasty_paid_session` then `anon`

## Quiz events

- `diagnostic_viewed`
  - `source=quiz`
  - `path=/quiz`
  - `version`

- `diagnostic_completed`
  - `stage`
  - `budget`
  - `delivery`
  - `pains`
  - `recommended_segment`
  - `recommended_plan`
  - `recommended_archetype`

## App events

- `diagnostic_recommendation_accepted`
  - `source_segment`
  - `selected_plan`
  - `selected_archetype`
  - `diagnostic_session_id`

- `free_builder_started`
  - `source_segment`
  - `selected_archetype`
  - `source`

- `checkout_started`
  - `selected_plan`
  - `source_segment`
  - `build_archetype`
  - `training_opt_in`
  - `diagnostic_session_id`

- `checkout_failed_to_start`
  - `selected_plan`
  - `error`

- `checkout_start_exception`
  - `selected_plan`

- `checkout_cancelled`
  - `source_segment`
  - `selected_plan`

- `checkout_paid_verified`
  - `paid_plan`
  - `amount`
  - `currency`
  - `mode`
  - `customer_email_present`

## Stripe metadata fields

`api/checkout.js` writes the following into checkout session metadata:

- `plan`
- `training_opt_in`
- `build_archetype`
- `source_segment`
- `diagnostic_session_id`
- `recommended_plan`
