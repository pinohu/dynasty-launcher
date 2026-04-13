// Vercel Edge Middleware — gates /app behind payment verification
// Runs at the edge BEFORE the static file is served

export const config = {
  // Match all paths so apex host (yourdeputy.com) can 308 to www before any static HTML.
  // Builder/admin gate below only applies under /app and /admin.
  matcher: ['/:path*'],
  runtime: 'edge',
};

export default function middleware(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();

  // ── Apex → canonical www (preserve path + query; HTTPS) ─────────────────
  // DNS must point yourdeputy.com at Vercel (A 76.76.21.21 or ALIAS to cname.vercel-dns.com).
  // Until then, upstream Apache may intercept apex and strip paths — fix DNS at registrar.
  if (host === 'yourdeputy.com') {
    const target = new URL(url.pathname + url.search, 'https://www.yourdeputy.com');
    return Response.redirect(target.href, 308);
  }

  const params = url.searchParams;

  // Only gate the builder and admin routes; everything else passes through to static files.
  if (url.pathname !== '/admin' && !url.pathname.startsWith('/app')) {
    return;
  }

  // ── /app/test-login helper — accepts raw key, encodes, redirects to /app ──
  if (url.pathname === '/app/test-login') {
    const keyFromQuery = params.get('k') || '';
    const safeQueryKey = keyFromQuery.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Builder Test Login — Your Deputy</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;padding:20px}
.card{width:min(520px,100%);background:#141414;border:1px solid #222;border-radius:12px;padding:22px}
h1{font-size:18px;margin-bottom:8px;color:#C9A84C}p{color:#9b9b9b;font-size:13px;line-height:1.5;margin-bottom:14px}
input{width:100%;padding:12px 14px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;margin-bottom:10px}
button{padding:11px 16px;background:#C9A84C;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer}
button:hover{opacity:.92}.row{display:flex;gap:10px;align-items:center}.hint{font-size:12px;color:#777;margin-top:10px}</style></head><body>
<div class="card">
  <h1>Builder Test Login</h1>
  <p>Paste your test admin key and continue to the builder with full privileges. No manual URL encoding required.</p>
  <input id="k" type="password" autocomplete="off" placeholder="Paste TEST_ADMIN_KEY" value="${safeQueryKey}">
  <div class="row">
    <button onclick="go()">Continue to Builder</button>
    <button onclick="window.location.href='/admin'" style="background:#1f1f1f;color:#ddd;border:1px solid #333">Open Admin</button>
  </div>
  <p class="hint">Tip: You can also open this page as <code>/app/test-login#yourKey</code>.</p>
</div>
<script>
  (function prefillFromHash(){
    try {
      if (!document.getElementById('k').value && location.hash && location.hash.length > 1) {
        document.getElementById('k').value = decodeURIComponent(location.hash.slice(1));
      }
    } catch (e) {}
  })();
  function go() {
    const raw = (document.getElementById('k').value || '').trim();
    if (!raw) return;
    const enc = encodeURIComponent(raw);
    window.location.href = '/app?k=' + enc;
  }
</script></body></html>`, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // ── /admin route — require admin key in URL or let page handle token check ──
  if (url.pathname === '/admin') {
    const adminKey = process.env.ADMIN_KEY || '';
    const testAdminKey = process.env.TEST_ADMIN_KEY || '';
    // Allow with key in URL
    if (params.get('k') && ((adminKey && params.get('k') === adminKey) || (testAdminKey && params.get('k') === testAdminKey))) return;
    // Allow admin page to load after token bootstrap; admin.html still validates token server-side.
    if (params.get('auth') === 'token') return;
    // Block with a minimal auth page
    return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin — Your Deputy</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;flex-direction:column;gap:16px}
input{padding:10px 16px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;width:280px;text-align:center}
button{padding:10px 24px;background:#C9A84C;color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px}
button:hover{opacity:.9}p{color:#666;font-size:12px}</style></head><body>
<div style="font-size:2rem">⚡</div><h2>Admin Access</h2>
<input type="password" id="ak" placeholder="Admin key" onkeydown="if(event.key==='Enter')go()">
<button onclick="go()">Authenticate</button>
<p id="err"></p>
<script>function go(){const k=document.getElementById('ak').value;if(!k)return;
fetch('/api/auth?action=verify_admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k})})
.then(r=>r.json()).then(d=>{if(d.ok&&d.admin){localStorage.setItem('dynasty_admin_token',d.token);window.location.href='/admin?auth=token';}
else{document.getElementById('err').textContent='Invalid key';}}).catch(()=>{document.getElementById('err').textContent='Server error';});}</script>
</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  // Allow admin access with server-side key (never hardcoded in client)
  const adminKey = process.env.ADMIN_KEY || '';
  const testAdminKey = process.env.TEST_ADMIN_KEY || '';
  if (params.get('k') && ((adminKey && params.get('k') === adminKey) || (testAdminKey && params.get('k') === testAdminKey))) {
    return; // Pass through — app.html will verify server-side
  }

  // Free scoring tier — let users enter the builder for viability analysis (no payment needed)
  if (params.get('plan') === 'free') {
    return; // Pass through — JS will set free tier and show scoring UI
  }

  // Allow Stripe payment success returns (checkPaymentReturn will verify server-side)
  if (params.get('payment') === 'success' && params.get('session_id')) {
    return; // Pass through — JS will verify with Stripe
  }

  // Plan purchase URLs — redirect to Stripe checkout at the edge (don't serve app.html)
  const plan = params.get('plan');
  if (plan === 'custom_volume') {
    return Response.redirect(new URL('/#pricing', request.url), 307);
  }
  if (plan && ['blueprint', 'scoring_pro', 'strategy_pack', 'foundation', 'starter', 'professional', 'enterprise', 'managed'].includes(plan)) {
    // Redirect to checkout API which creates Stripe session and redirects to Stripe
    const checkoutUrl = new URL('/api/checkout', request.url);
    checkoutUrl.searchParams.set('action', 'create_session');
    // We can't POST from a redirect, so serve a tiny page that auto-submits
    return new Response(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Redirecting to checkout...</title>
<style>body{background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;flex-direction:column;gap:16px}h2{font-size:1.2rem;font-weight:400;color:rgba(255,255,255,0.6)}</style>
</head><body>
<div style="font-size:2rem">⚡</div>
<h2>Redirecting to secure checkout...</h2>
<script>
fetch('/api/checkout?action=create_session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: '${plan}' })
})
.then(r => r.json())
.then(d => {
  if (d.ok && d.url) { window.location.href = d.url; }
  else { document.body.innerHTML = '<div style="text-align:center;padding:40px"><h2 style="color:#fff;font-size:1.4rem">⚡ Your Deputy</h2><p style="color:rgba(255,255,255,0.5);margin:16px 0">' + (d.error || 'Checkout unavailable') + '</p><a href="/#pricing" style="color:#C9A84C">&larr; Back to plans</a></div>'; }
})
.catch(() => { window.location.href = '/#pricing'; });
</script>
</body></html>`, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // Returning users: pass through so app.html loads the builder shell (Clerk sign-in) or paid session
  if (params.get('returning') === '1') {
    return;
  }

  // /app — always serve app.html; edge cannot read localStorage (admin token, paid session).
  // Client-side gate in app.html enforces access; without this, /app reload after ?k=… shows the edge gate.
  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
    return;
  }

  // No valid access — return a gate page that redirects to pricing
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Deputy</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif;flex-direction:column;gap:20px;text-align:center;padding:24px}
h2{font-size:1.6rem;font-weight:600}
p{color:rgba(255,255,255,0.5);font-size:1rem;max-width:400px;line-height:1.6}
.btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
a{color:#C9A84C;text-decoration:none;font-weight:600;padding:12px 28px;border:1px solid #C9A84C;border-radius:10px;transition:all .2s;font-size:15px}
a:hover{background:#C9A84C;color:#000}
a.primary{background:#C9A84C;color:#000}
a.primary:hover{box-shadow:0 0 20px rgba(201,168,76,0.3)}
</style>
</head>
<body>
<div style="font-size:2.5rem">⚡</div>
<h2>Your Deputy</h2>
<p>Judgment on whether the business holds up, implementation you can ship, and accountable scope — not a menu of AI tasks. Score free, strategy documents $697, or full build from $1,997.</p>
<div class="btns">
  <a href="/app?plan=free">Score Free</a>
  <a href="/app?plan=strategy_pack">Strategy Pack — $697</a>
  <a href="/app?plan=foundation" class="primary">Foundation — $1,997</a>
</div>
<div class="btns" style="margin-top:8px">
  <a href="/#pricing" style="border:none;padding:4px 0;font-size:13px;color:rgba(201,168,76,0.6)">View all plans</a>
</div>
<p style="font-size:13px;color:rgba(255,255,255,0.25);margin-top:12px">Already purchased? <a href="/app?returning=1" style="border:none;padding:0;font-size:13px;color:rgba(201,168,76,0.6)">Sign in</a></p>
</body>
</html>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
