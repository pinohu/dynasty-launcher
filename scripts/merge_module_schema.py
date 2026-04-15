#!/usr/bin/env python3
"""One-shot backfill + category migration.

- Renames `short_description` -> `description_short` on all modules
- Adds `tier_availability`, `compliance_flags`, `prerequisite_modules`,
  `downgrade_behavior` where appropriate
- Moves 4 modules from lead-capture/communication into the new lead-response
  category (updates the on-file `category` field too)

Run from repo root.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path("product/modules")

# Launcher-tier availability per module. Foundation = simple modules a DIY user
# can set up on their own account; Professional+ = require integrations
# typically provisioned via api/provision.js mod_* functions.
TIER_AVAILABILITY: dict[str, list[str]] = {
    # Foundation-available
    "webform_autoreply": ["foundation", "professional", "enterprise"],
    "instant_lead_ack": ["foundation", "professional", "enterprise"],
    "after_hours_autoresponder": ["foundation", "professional", "enterprise"],
    "appointment_confirmation": ["foundation", "professional", "enterprise"],
    "invoice_sent_notification": ["foundation", "professional", "enterprise"],
    # Professional & Enterprise only
    "missed_call_textback": ["professional", "enterprise"],
    "appointment_reminder": ["professional", "enterprise"],
    "no_show_recovery": ["professional", "enterprise"],
    "reschedule_workflow": ["professional", "enterprise"],
    "estimate_followup": ["professional", "enterprise"],
    "proposal_view_tracker": ["professional", "enterprise"],
    "lost_deal_reactivation": ["professional", "enterprise"],
    "post_job_review_request": ["professional", "enterprise"],
    "unhappy_customer_interception": ["professional", "enterprise"],
    "overdue_invoice_reminder": ["professional", "enterprise"],
    "payment_recovery": ["professional", "enterprise"],
    "dormant_customer_reactivation": ["professional", "enterprise"],
    "service_due_reminder": ["professional", "enterprise"],
    "speed_to_lead_response": ["professional", "enterprise"],
    "voicemail_transcription": ["professional", "enterprise"],
}

# Compliance flags the activation UI / runtime must respect.
COMPLIANCE_FLAGS: dict[str, list[str]] = {
    "missed_call_textback": ["sms_opt_out", "quiet_hours", "a2p_registered"],
    "webform_autoreply": ["email_footer", "sms_opt_out"],
    "instant_lead_ack": ["email_footer", "sms_opt_out", "quiet_hours"],
    "after_hours_autoresponder": ["email_footer", "sms_opt_out", "quiet_hours"],
    "appointment_confirmation": ["sms_opt_out"],
    "appointment_reminder": ["sms_opt_out", "quiet_hours"],
    "no_show_recovery": ["sms_opt_out", "quiet_hours"],
    "reschedule_workflow": ["sms_opt_out"],
    "estimate_followup": ["email_footer", "quiet_hours"],
    "proposal_view_tracker": [],
    "lost_deal_reactivation": ["email_footer", "can_spam", "quiet_hours"],
    "post_job_review_request": ["sms_opt_out", "review_solicitation_policy"],
    "unhappy_customer_interception": ["review_solicitation_policy", "pii_minimization"],
    "invoice_sent_notification": ["email_footer"],
    "overdue_invoice_reminder": ["email_footer", "fdcpa_b2b_tone_guard"],
    "payment_recovery": ["email_footer", "pci_hand_off", "fdcpa_b2b_tone_guard"],
    "dormant_customer_reactivation": ["email_footer", "can_spam", "sms_opt_out"],
    "service_due_reminder": ["sms_opt_out", "quiet_hours"],
    "speed_to_lead_response": ["sms_opt_out", "quiet_hours"],
    "voicemail_transcription": ["pii_minimization", "call_recording_consent"],
}

# Hard module-to-module prerequisites (events only fire if prereq is active).
PREREQUISITE_MODULES: dict[str, list[str]] = {
    "unhappy_customer_interception": ["post_job_review_request"],
}

# Most modules get default safe behavior. Overrides here.
DOWNGRADE_OVERRIDES: dict[str, dict] = {
    "unhappy_customer_interception": {"on_cancel": "manual_review", "data_retention_days": 365},
    "payment_recovery": {"on_cancel": "manual_review", "data_retention_days": 730},
    "voicemail_transcription": {"on_cancel": "disable_and_archive", "data_retention_days": 180},
}
DEFAULT_DOWNGRADE = {"on_cancel": "disable_new_runs_keep_data", "data_retention_days": 365}

# Modules that should live in the new lead-response category.
LEAD_RESPONSE_MODULES = {
    "instant_lead_ack",
    "after_hours_autoresponder",
    "speed_to_lead_response",
    "voicemail_transcription",
}


def ordered(d: dict) -> dict:
    """Return a dict with properties in a stable, readable order."""
    preferred = [
        "schema_version",
        "module_code",
        "name",
        "description_short",
        "description_long",
        "outcome",
        "category",
        "price_monthly",
        "tier_availability",
        "capabilities_required",
        "capabilities_optional",
        "prerequisite_modules",
        "compliance_flags",
        "activation_type",
        "trigger",
        "inputs",
        "actions",
        "configurable_settings",
        "templates_used",
        "recommended_for_personas",
        "recommended_for_blueprints",
        "upsell_from",
        "upsell_to",
        "kpis",
        "downgrade_behavior",
        "owner_notes",
        "source_refs",
        "status",
    ]
    out = {k: d[k] for k in preferred if k in d}
    # Append anything unexpected at the end so we never silently drop data.
    for k, v in d.items():
        if k not in out:
            out[k] = v
    return out


def process(path: Path) -> tuple[Path, bool]:
    data = json.loads(path.read_text())
    code = data["module_code"]

    # Rename short_description -> description_short
    if "short_description" in data and "description_short" not in data:
        data["description_short"] = data.pop("short_description")

    # tier_availability
    if code in TIER_AVAILABILITY and "tier_availability" not in data:
        data["tier_availability"] = TIER_AVAILABILITY[code]

    # compliance_flags
    if code in COMPLIANCE_FLAGS and "compliance_flags" not in data:
        data["compliance_flags"] = COMPLIANCE_FLAGS[code]

    # prerequisite_modules
    if "prerequisite_modules" not in data:
        data["prerequisite_modules"] = PREREQUISITE_MODULES.get(code, [])

    # downgrade_behavior
    if "downgrade_behavior" not in data:
        data["downgrade_behavior"] = DOWNGRADE_OVERRIDES.get(code, DEFAULT_DOWNGRADE).copy()

    # Category move to lead-response
    moved = False
    new_path = path
    if code in LEAD_RESPONSE_MODULES:
        data["category"] = "lead-response"
        new_dir = ROOT / "lead-response"
        new_dir.mkdir(parents=True, exist_ok=True)
        new_path = new_dir / path.name
        moved = new_path != path

    # Write
    ordered_data = ordered(data)
    new_path.write_text(json.dumps(ordered_data, indent=2) + "\n")

    if moved and path.exists():
        path.unlink()

    return new_path, moved


def main() -> int:
    if not ROOT.exists():
        print("ERROR: run from repo root (product/modules not found)")
        return 1

    moved_paths: list[tuple[Path, Path]] = []
    for p in sorted(ROOT.rglob("*.json")):
        before = p
        after, moved = process(p)
        if moved:
            moved_paths.append((before, after))

    # Clean up empty directories
    for d in sorted({p.parent for p in ROOT.rglob("*")}, reverse=True):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()

    print(f"Processed modules. {len(moved_paths)} moved to lead-response/.")
    for old, new in moved_paths:
        print(f"  {old} -> {new}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
