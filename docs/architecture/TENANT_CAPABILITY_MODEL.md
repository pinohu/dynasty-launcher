# Tenant & Capability Model

> Defines the shared business objects every module reads and writes, and the
> capabilities modules depend on.

## Why this exists

The only way to let customers self-serve new modules after onboarding is to
have a **single shared workspace** underneath every module. Onboarding collects
data broader than what the first-purchased module strictly needs. That way,
every later add-on can check prerequisites and either activate instantly or run
a short guided-setup wizard — never a from-scratch configuration project.

## Tenant workspace

A tenant is a customer workspace. Its shape is defined in
`product/schema/tenant.schema.json`.

### Core objects

| Object        | Purpose                                                 |
|---------------|---------------------------------------------------------|
| `tenant`      | The workspace itself: plan, status, blueprint, entitlements |
| `profile`     | Business name, phone, email, address, service areas, hours |
| `user`        | Staff member with role and permissions                   |
| `contact`     | Person record: contacts, leads, and customers            |
| `lead`        | Inbound interest with source and status                  |
| `appointment` | Scheduled job/visit/consultation                         |
| `job`         | Completed or in-progress work tied to a contact          |
| `estimate`    | Quote/proposal sent to a contact                         |
| `invoice`     | Billable line items, due date, paid state                |
| `payment`     | Payment attempt on an invoice                            |
| `message`     | Outbound or inbound email/SMS/voice event                |
| `template`    | Reusable content used by modules                         |
| `automation_setting` | Tenant-wide automation preferences (quiet hours, escalation, defaults) |
| `entitlement` | A module the tenant is allowed to activate               |
| `event`       | Telemetry for triggers and KPIs                          |

### Onboarding gathers data broader than first purchase

See `product/journeys/onboarding.json` for the canonical flow. The critical
principle: onboarding is designed for the **ecosystem**, not just the first
module. This prevents re-configuration for every subsequent add-on.

## Capabilities

A capability is a platform ability that modules depend on. Each is defined in
`product/capabilities/*.json`.

### Starter capabilities

| Code        | Category      | Satisfied by                              |
|-------------|---------------|-------------------------------------------|
| `email`     | communication | Customer-owned sending domain + provider  |
| `sms`       | communication | Tenant-owned number + A2P registration    |
| `phone`     | communication | Tracking/forwarding number + webhooks     |
| `calendar`  | scheduling    | OAuth to Google/MS/Trafft with two-way sync |
| `forms`     | data          | At least one published form routed to CRM |
| `crm`       | data          | Initialized contact/lead/pipeline objects |
| `estimates` | commerce      | Estimate template + send/view webhooks    |
| `invoicing` | commerce      | Invoice provider connected + paid webhook |
| `reviews`   | content       | Google + at least one alt review link     |
| `payments`  | commerce      | Merchant account connected (Stripe Connect preferred) |

### How capabilities relate to modules

```
module.capabilities_required = ["sms", "crm", "phone"]
    ↓
tenant.capabilities_enabled = ["email", "sms", "crm", "calendar", "reviews"]
    ↓
prereq_check: missing = ["phone"]   →   activation_type = "guided"
    ↓
run wiz_phone_connect                →   capabilities_enabled += "phone"
    ↓
module.state = active
```

### Capabilities vs integrations

A capability is the abstract ability (e.g. "send SMS"). An integration is the
concrete vendor (e.g. SMS-iT, Twilio, Telnyx). The capability layer decides how
to satisfy its requirement for a given tenant. Modules only speak to
capabilities.

## Data boundary with the launcher

Per the "third-party credential boundary" rule in root `CLAUDE.md`:

- Capabilities should be configured on the **customer's** vendor accounts,
  not the launcher's shared pool.
- `DYNASTY_TOOL_CONFIG` is used for **generation** and **one-time
  provisioning**, not for routing ongoing customer operations.
- Modules that require secrets read them from the tenant's own capability
  configuration, never from a shared launcher secret.

## Extensibility

Adding a new capability requires:

1. A new file in `product/capabilities/`.
2. A setup wizard implementation somewhere reachable by
   `api/tenants/run-guided-setup.js`.
3. A `mod_*` function in `api/provision.js` if the capability requires
   one-time provisioning on vendor side.

Adding a new module that depends only on existing capabilities requires only a
new file in `product/modules/`. No runtime code changes.
