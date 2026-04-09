// Vercel Edge Middleware — gates /app behind payment verification
// Runs at the edge BEFORE the static file is served

export const config = {
  matcher: ['/app', '/app/'],
};

export default function middleware(request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  // Allow admin access with key
  if (params.get('k') === 'DYNASTY2026') {
    return; // Pass through to app.html
  }

  // Allow Stripe payment success returns (checkPaymentReturn will verify server-side)
  if (params.get('payment') === 'success' && params.get('session_id')) {
    return; // Pass through — JS will verify with Stripe
  }

  // Allow plan purchase URLs (checkPlanPurchase will redirect to Stripe)
  const plan = params.get('plan');
  if (plan && ['starter', 'professional', 'enterprise'].includes(plan)) {
    return; // Pass through — JS will redirect to Stripe checkout
  }

  // Check for dynasty_session cookie (set by successful payment verification)
  const cookies = request.headers.get('cookie') || '';
  if (cookies.includes('dynasty_session=verified')) {
    return; // Pass through — has verified payment cookie
  }

  // No valid access — return a gate page that redirects to pricing
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dynasty Launcher</title>
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
<h2>Dynasty Launcher</h2>
<p>Build a complete operating business from one prompt. Choose a plan to get started.</p>
<div class="btns">
  <a href="/#pricing">View Plans</a>
  <a href="/app?plan=professional" class="primary">Get Started — $997</a>
</div>
<p style="font-size:13px;color:rgba(255,255,255,0.25);margin-top:20px">Already purchased? <a href="/app?plan=starter" style="border:none;padding:0;font-size:13px;color:rgba(201,168,76,0.6)">Sign in</a></p>
</body>
</html>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
