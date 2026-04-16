import { Pool } from '@neondatabase/serverless';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function monitorFailedLogins(userId) {
  const result = await pool.query(
    'SELECT COUNT(*) as attempts FROM login_attempts WHERE user_id = $1 AND success = false AND created_at > NOW() - INTERVAL \'1 hour\'',
    [userId]
  );
  const attempts = parseInt(result.rows[0].attempts);

  if (attempts >= 5) {
    await pool.query(
      'UPDATE users SET account_locked = true, locked_until = NOW() + INTERVAL \'24 hours\', lock_reason = $1 WHERE id = $2',
      ['Failed login attempts exceeded', userId]
    );
    return { locked: true, attempts, message: 'Account locked for 24 hours' };
  }
  return { locked: false, attempts };
}

async function performPermissionAudit(companyId) {
  const result = await pool.query(
    `SELECT u.id, u.email, r.name as role_name, p.action, p.resource FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     LEFT JOIN role_permissions rp ON r.id = rp.role_id
     LEFT JOIN permissions p ON rp.permission_id = p.id
     WHERE u.company_id = $1`,
    [companyId]
  );

  const auditLog = {
    companyId,
    totalUsers: new Set(result.rows.map(r => r.id)).size,
    auditedAt: new Date(),
    findings: result.rows
  };

  await pool.query(
    'INSERT INTO permission_audit_logs (company_id, findings, audit_date) VALUES ($1, $2, NOW())',
    [companyId, JSON.stringify(auditLog)]
  );

  return auditLog;
}

async function checkSSLExpiry(companyId) {
  const result = await pool.query(
    `SELECT domain, certificate_name, expiry_date,
            EXTRACT(DAY FROM expiry_date - NOW()) as days_remaining
     FROM ssl_certificates WHERE company_id = $1 AND expiry_date > NOW()`,
    [companyId]
  );

  const expiringCerts = result.rows.filter(c => c.days_remaining < 30);

  if (expiringCerts.length > 0) {
    await pool.query(
      'INSERT INTO security_events (event_type, severity, company_id, details, created_at) VALUES ($1, $2, $3, $4, NOW())',
      ['SSL_EXPIRY_WARNING', 'high', companyId, JSON.stringify(expiringCerts)]
    );
  }

  return { total: result.rows.length, expiring: expiringCerts };
}

async function enforceRBAC(userId, requiredRole, requiredPermission) {
  const result = await pool.query(
    `SELECT ur.role_id FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     WHERE u.id = $1 AND r.name = $2`,
    [userId, requiredRole]
  );

  if (result.rows.length === 0) {
    await logSecurityEvent(userId, 'UNAUTHORIZED_ACCESS_ATTEMPT', 'high', {
      role: requiredRole,
      permission: requiredPermission
    });
    return { authorized: false, reason: 'Insufficient role' };
  }

  const permResult = await pool.query(
    `SELECT p.action FROM user_roles ur
     JOIN role_permissions rp ON ur.role_id = rp.role_id
     JOIN permissions p ON rp.permission_id = p.id
     WHERE ur.user_id = $1 AND p.action = $2`,
    [userId, requiredPermission]
  );

  if (permResult.rows.length === 0) {
    return { authorized: false, reason: 'Missing permission' };
  }

  return { authorized: true };
}

async function logSecurityEvent(userId, eventType, severity, details) {
  const eventId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO security_events (id, user_id, event_type, severity, details, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [eventId, userId, eventType, severity, JSON.stringify(details)]
  );
  return eventId;
}

async function alertSecurityTeam(eventType, severity, companyId, details) {
  const admins = await pool.query(
    'SELECT email FROM users WHERE company_id = $1 AND role = $2',
    [companyId, 'admin']
  );

  for (const admin of admins.rows) {
    await fetch('https://api.acumbamail.com/1/send_email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.ACUMBAMAIL_API_KEY}` },
      body: JSON.stringify({
        to: admin.email,
        from: 'security@dynasty.app',
        subject: `SECURITY ALERT: ${eventType}`,
        html: `<p><strong>Event:</strong> ${eventType}</p><p><strong>Severity:</strong> ${severity}</p><p><strong>Details:</strong> ${JSON.stringify(details)}</p>`
      })
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId, companyId, requiredRole, requiredPermission, eventType, severity, details } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    let response;

    switch (action) {
      case 'failed_login_monitor':
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId' });
        }
        response = await monitorFailedLogins(userId);
        break;

      case 'permission_audit':
        if (!companyId) {
          return res.status(400).json({ error: 'Missing companyId' });
        }
        response = await performPermissionAudit(companyId);
        break;

      case 'ssl_expiry_check':
        if (!companyId) {
          return res.status(400).json({ error: 'Missing companyId' });
        }
        response = await checkSSLExpiry(companyId);
        break;

      case 'enforce_rbac':
        if (!userId || !requiredRole || !requiredPermission) {
          return res.status(400).json({ error: 'Missing userId, requiredRole, or requiredPermission' });
        }
        response = await enforceRBAC(userId, requiredRole, requiredPermission);
        break;

      case 'log_security_event':
        if (!userId || !eventType || !severity) {
          return res.status(400).json({ error: 'Missing userId, eventType, or severity' });
        }
        const eventId = await logSecurityEvent(userId, eventType, severity, details || {});
        if (severity === 'high' || severity === 'critical') {
          const userResult = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
          if (userResult.rows.length > 0) {
            await alertSecurityTeam(eventType, severity, userResult.rows[0].company_id, details);
          }
        }
        response = { success: true, eventId };
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(200).json({ success: true, ...response });
  } catch (error) {
    console.error('Security error:', error);
    return res.status(500).json({
      error: 'Security check failed',
      message: error.message
    });
  }
}
