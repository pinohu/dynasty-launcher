# Integration Module Interface

## Credential boundary
Use **Dynasty** (`DYNASTY_TOOL_CONFIG`) keys only to **create or configure** resources during provisioning (derivative output, one-time setup). The **delivered product** must **not** depend on those keys for day‑2 operation: document handoff in **MANUAL-ACTIONS.md**, map secrets to **customer-owned** env vars, and prefer vendor flows where the **customer account** owns billing, data, and API access. Do **not** POST real secrets to the **customer’s** Vercel project via API — placeholders + repo/docs only (see `api/provision.js`).

Every module follows this exact interface. Copy this as the starting point for any new module.

```javascript
// ── mod_example.js ─────────────────────────────────────────────────
// Provisions: [service name] for deployed projects
// API docs: [url]
// Credential key: config.[category].[key]
// Sprint: [number]

async function mod_example(config, project, liveUrl) {
  // config = parsed DYNASTY_TOOL_CONFIG
  // project = { name, slug, description, type, domain, accent, price, location, services }
  // liveUrl = deployed Vercel/20i URL (e.g., https://myproject.vercel.app)

  const results = {
    ok: false,
    service: 'example',
    details: {},
    cleanup: null,  // function to rollback on failure
  };

  const apiKey = config.category?.key;
  if (!apiKey) {
    results.error = 'API key not configured';
    results.fallback = 'Set config.category.key in DYNASTY_TOOL_CONFIG';
    return results;
  }

  try {
    // Step 1: Create resource
    const createResp = await fetch('https://api.example.com/v1/resources', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: project.name,
        // ... service-specific fields
      })
    });
    if (!createResp.ok) throw new Error(`API error: ${createResp.status}`);
    const resource = await createResp.json();

    // Step 2: Configure resource
    // ...

    // Register cleanup function
    results.cleanup = async () => {
      await fetch(`https://api.example.com/v1/resources/${resource.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
    };

    results.ok = true;
    results.details = {
      resource_id: resource.id,
      url: resource.url,
      // ... provisioned details
    };

  } catch (e) {
    results.error = e.message;
    results.fallback = 'See OPERATIONS.md for manual setup instructions';
  }

  return results;
}
```

## Module Registration in provision.js

After building a module, register it in the `fullstack_deploy` action:

```javascript
// In provision.js, after deployment succeeds and liveUrl is known:
const moduleResults = {};

// Run modules that have credentials available
if (config.modules_enabled?.hosting && config.infrastructure?.twentyi_general) {
  moduleResults.hosting = await mod_hosting(config, project, liveUrl);
}
if (config.modules_enabled?.billing && config.payments?.stripe_live) {
  moduleResults.billing = await mod_billing(config, project, liveUrl);
}
// ... etc for each module

// Include results in response
results.modules = moduleResults;
```

## Adding Module to Frontend (app.html)

Add a progress indicator for the new module:

```javascript
// After deployment checkpoint (Phase 8):
if (provisionResult.modules?.hosting?.ok) {
  addP('mod-hosting', 'Domain + email provisioned', '', '⬡ Hosting');
  setP('mod-hosting', 'ok', provisionResult.modules.hosting.details.domain);
} else if (provisionResult.modules?.hosting?.error) {
  addP('mod-hosting', 'Domain setup', '', '⬡ Hosting');
  setP('mod-hosting', 'er', provisionResult.modules.hosting.fallback);
}
```
