# Category 20 — Compliance & Legal

10 automations. Anchor category for `Compliance Carol` persona and the PA CROP Services reference implementation (`docs-source/MARCH_2026_AUTOMATIONS_INVENTORY.md`).

## Automations

| ID | Title | Trigger | Topology | Notes |
|---|---|---|---|---|
| 20.01 | Regulatory Deadline Monitor | cron daily | T1 | Core automation for Carol persona |
| 20.02 | License Renewal Tracker | cron daily | T1 | Per-license type |
| 20.03 | Annual Report Reminder | cron + date | T1 | Entity-aware |
| 20.04 | Required Posting Audit | cron weekly | T1 | OSHA/labor law posters |
| 20.05 | Policy Update Notifier | cron daily | T1 | Policy change → staff acknowledgment |
| 20.06 | Training Certification Tracker | cron daily | T1 | Staff cert expiry |
| 20.07 | Data Retention Policy Enforcement | cron daily | T1 | Auto-archive/delete |
| 20.08 | Consent Record Manager | event-based | T2 | GDPR/CCPA consent logs |
| 20.09 | Compliance Document Version Control | commit-based | T2 | Policy doc history |
| 20.10 | Audit Prep Assembler | on-demand | T2 | Export compliance package |

## Why this category is special

Compliance is the most **high-stakes, low-margin-of-error** domain. A missed deadline can cost more than the tenant pays for the automation in a year. The deployer applies extra guardrails to every Cat-20 automation:

1. **Redundant notifications.** Every deadline automation sends at T-30, T-14, T-7, T-3, T-1 days. No single-point-of-failure channel.
2. **Acknowledged receipt.** Tenant must click-through on notifications to mark "handled."
3. **Audit log retention.** All Cat-20 runs are logged for 7 years (regulated class).
4. **Jurisdictional pinning.** Each automation declares `jurisdictions: ["PA", "NJ", ...]` and refuses to run against entities outside declared jurisdictions.

## The PA CROP reference implementation

The inventory lists these Cat-20-ish automations as LIVE:

| # in inventory | What it does | Catalog equivalent |
|---|---|---|
| 77 | PA DOS entity status monitor | 20.01 + 20.03 |
| 78 | Real-time compliance health scoring | 20.01 |
| 79 | Annual report reminder automation | 20.03 |
| 80 | Compliance alert blog post generation | 20.01 → 24.01 |
| 81 | Legislative change monitor | 20.05 |

This proves the category is deployable at production quality. The deployer's 20.* manifests reference the PA CROP implementations as templates.

## Multi-state scaling

Current state: PA is fully supported. 20.01/20.03 operate against PA DOS via scraping + daily diff. Other states are stubs.

Roadmap (documented in `analysis/per-category/cat-20-compliance.md#roadmap`):
1. **Tier 1 (imminent):** NJ, NY, DE, CA, TX, FL — adapters in `deployer/lib/adapters/jurisdictions/`.
2. **Tier 2 (as-needed):** Remaining 43 states.
3. **Tier 3:** Federal (IRS, SBA), multi-national (UK Companies House, etc.).

Each jurisdiction adapter exposes:

```javascript
export default {
  jurisdiction: 'PA',
  async getEntityStatus(entityId) { /* ... */ },
  async getAnnualReportDeadline(entityId) { /* ... */ },
  async isInGoodStanding(entityId) { /* ... */ },
  async listLicenses(businessName) { /* ... */ }
};
```

## Deployment checklist for Compliance Carol tenants

1. Confirm list of entities and their jurisdictions → `tenant.yaml → compliance.entities`.
2. Confirm list of license types and renewal dates → import CSV to tenant.
3. Deploy 20.01 as the foundation (depended on by 20.02, 20.03, 20.06).
4. Configure notification channels: email (required), SMS (recommended), voice call escalation (optional, from 14.*).
5. Set up "accountable owner" for each compliance item → CRM user assignment.
6. Deploy 20.10 (audit prep) last; it depends on 20.01–20.09 having generated 30+ days of logs.

## Testing

Each 20.* manifest includes a synthetic-event generator. `deployer verify` fires a fake "deadline in 30 days" event and confirms the notification went out.

## Cost profile

Cat-20 automations are **low-cost to run** (no LLM, cheap API calls) but **high-value** — Carol personas pay $149–$499/mo for just this category. This is the most margin-dense category.

## Related categories

- Cat-43 (Business Formation) — upstream: creates the entities Cat-20 tracks.
- Cat-35 (Documents) — downstream: stores the compliance documents.
- Cat-37 (QA & Audit) — adjacent: internal audits vs external compliance.
- Cat-44 (Insurance) — adjacent: insurance compliance overlaps (COI expiry).
