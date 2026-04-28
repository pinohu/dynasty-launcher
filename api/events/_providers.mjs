// api/events/_providers.mjs — outbound vendor handlers (email / sms)
// -----------------------------------------------------------------------------
// Provider-aware senders. Automatically pick the vendor configured in
// DYNASTY_TOOL_CONFIG (Acumbamail for email, SMS-iT for SMS). If no provider
// is configured OR the key is stub-prefixed, the sender returns a stub
// success so end-to-end flows still work for dev and tests.
//
// Per root CLAUDE.md: these Dynasty-held keys are the launcher's fallback.
// For production tenants, the plan is to eventually route through tenant-owned
// credentials (tenant.capabilities_enabled bindings). Until then we use the
// shared pool but NEVER write secrets to customer infra.
// -----------------------------------------------------------------------------

function loadConfig() {
  try { return JSON.parse(process.env.DYNASTY_TOOL_CONFIG || '{}'); }
  catch { return {}; }
}

function isStub(key) {
  return !key || typeof key !== 'string' || key.startsWith('STUB') || key.startsWith('EXPIRED') || key.length < 10;
}

function productionRuntime() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

// -----------------------------------------------------------------------------
// Email: Acumbamail preferred, Resend fallback
// -----------------------------------------------------------------------------

export async function sendEmail({ to, subject, body, template_ref = null, tenant_id = null, module_code = null }) {
  const cfg = loadConfig();
  const acumba = process.env.ACUMBAMAIL_KEY || cfg.comms?.acumbamail || null;
  const resend = process.env.RESEND_KEY || cfg.comms?.resend || null;

  // Stub mode — no provider configured
  if (isStub(acumba) && isStub(resend)) {
    return productionRuntime()
      ? { ok: false, provider: 'none', error: 'email_provider_not_configured', to, subject, template_ref }
      : { ok: true, provider: 'stub', to, subject, template_ref };
  }

  // Prefer Acumbamail
  let acumbaError = null;
  if (!isStub(acumba)) {
    try {
      const form = new URLSearchParams();
      form.append('auth_token', acumba);
      form.append('from_email', cfg.comms?.email_from || 'notifications@yourdeputy.com');
      form.append('from_name', cfg.comms?.email_from_name || 'Your Deputy');
      form.append('to_email', to);
      form.append('subject', subject || 'Notification from Your Deputy');
      form.append('body', body || `<p>Module: ${module_code}. Template: ${template_ref}.</p>`);
      const r = await fetch('https://acumbamail.com/api/1/sendOne/', {
        method: 'POST',
        body: form,
      });
      if (r.ok) return { ok: true, provider: 'acumbamail', to, subject };
      const text = await r.text();
      acumbaError = text.slice(0, 200);
    } catch (e) {
      // Fall through to resend
      acumbaError = e.message;
      console.error('[providers.email] acumbamail failed:', e.message);
    }
  }

  if (!isStub(resend)) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resend}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: cfg.comms?.email_from || 'notifications@yourdeputy.com',
          to: [to],
          subject: subject || 'Notification',
          html: body || `<p>Module: ${module_code}. Template: ${template_ref}.</p>`,
        }),
      });
      const data = await r.json().catch(() => ({}));
      return r.ok
        ? { ok: true, provider: 'resend', to, id: data.id }
        : { ok: false, provider: 'resend', error: data.message || `${r.status}` };
    } catch (e) {
      return { ok: false, provider: 'resend', error: e.message };
    }
  }

  return {
    ok: false,
    provider: 'acumbamail',
    error: acumbaError || 'email_provider_failed_without_fallback',
    to,
  };
}

// -----------------------------------------------------------------------------
// SMS: SMS-iT preferred
// -----------------------------------------------------------------------------

export async function sendSms({ to, body, template_ref = null, tenant_id = null, module_code = null }) {
  const cfg = loadConfig();
  const smsit = process.env.SMSIT_KEY || cfg.comms?.smsit || null;

  if (isStub(smsit)) {
    return productionRuntime()
      ? { ok: false, provider: 'none', error: 'sms_provider_not_configured', to, template_ref }
      : { ok: true, provider: 'stub', to, body: body?.slice(0, 60), template_ref };
  }

  try {
    const r = await fetch('https://api.smsit.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${smsit}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        body: body || `Your Deputy: ${template_ref}`,
        metadata: { tenant_id, module_code, template_ref },
      }),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok
      ? { ok: true, provider: 'smsit', to, id: data.message_id }
      : { ok: false, provider: 'smsit', error: data.message || `${r.status}` };
  } catch (e) {
    return { ok: false, provider: 'smsit', error: e.message };
  }
}

// -----------------------------------------------------------------------------
// Diagnostics — used by admin / health endpoints
// -----------------------------------------------------------------------------

export function providerStatus() {
  const cfg = loadConfig();
  return {
    email: {
      acumbamail: !isStub(process.env.ACUMBAMAIL_KEY || cfg.comms?.acumbamail),
      resend: !isStub(process.env.RESEND_KEY || cfg.comms?.resend),
    },
    sms: {
      smsit: !isStub(process.env.SMSIT_KEY || cfg.comms?.smsit),
    },
  };
}
