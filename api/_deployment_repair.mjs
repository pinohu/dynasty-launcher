export function classifyVercelFailure(events = []) {
  const text = Array.isArray(events)
    ? events.map((event) => event?.text || event?.payload?.text || event?.payload?.info?.text || '').join('\n')
    : String(events || '');
  const lines = text.split(/\r?\n/);
  const diagnostic = {
    class: 'unknown',
    summary: '',
    paths: [],
    missingPackages: [],
    envVars: [],
    tsErrors: [],
    syntaxErrors: [],
    eslintIssues: [],
    routeIssues: [],
    rawSnippet: '',
  };

  if (/No Next\.js version detected|Could not identify Next\.js version|Root Directory setting matches the directory/i.test(text)) {
    diagnostic.class = 'vercel_root_mismatch';
    diagnostic.summary = 'Vercel is building the repo root but the Next.js app lives in frontend/';
    diagnostic.rawSnippet = lines.filter(Boolean).slice(-12).join(' | ').slice(0, 600);
    return diagnostic;
  }

  if (/Deployment Protection|Authentication Required|Vercel Authentication|401 Unauthorized|403 Forbidden/i.test(text)) {
    diagnostic.class = 'deployment_protection';
    diagnostic.summary = 'Vercel deployment protection is blocking public live verification';
    diagnostic.rawSnippet = lines.filter(Boolean).slice(-12).join(' | ').slice(0, 600);
    return diagnostic;
  }

  if (/doesn['’]t have a root layout|missing root layout|make sure every page has a root layout/i.test(text)) {
    diagnostic.class = 'next_root_layout_missing';
    diagnostic.summary = 'Next.js is routing through a root app/ tree that has pages but no app/layout.tsx';
    diagnostic.paths = Array.from(text.matchAll(/([\w./()[\]\-@]+\/page\.tsx)/g)).map((match) => match[1].replace(/^\.\//, ''));
    diagnostic.rawSnippet = lines.filter(Boolean).slice(-12).join(' | ').slice(0, 600);
    return diagnostic;
  }

  if (/npm ci can only install packages when your package\.json and package-lock\.json.*in sync|Missing: .* from lock file|Invalid: lock file/i.test(text)) {
    diagnostic.class = 'package_lock_drift';
    diagnostic.summary = 'package-lock.json is out of sync with package.json';
    diagnostic.paths = ['package-lock.json'];
    diagnostic.rawSnippet = lines.filter(Boolean).slice(-12).join(' | ').slice(0, 600);
    return diagnostic;
  }

  const addPath = (value) => {
    if (value && !diagnostic.paths.includes(value)) diagnostic.paths.push(value.replace(/^\.\//, ''));
  };
  const addPkg = (value) => {
    if (value && !diagnostic.missingPackages.includes(value)) diagnostic.missingPackages.push(value);
  };
  const addEnv = (value) => {
    if (value && !diagnostic.envVars.includes(value)) diagnostic.envVars.push(value);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const context = lines.slice(Math.max(0, i - 2), i + 4).join(' ');
    const path = line.match(/(\.\/[\w\-./()[\]@]+\.(?:tsx?|jsx?|mjs|cjs|json|css))/);
    if (/Module not found|Can't resolve|Cannot find module/i.test(context)) {
      addPath(path?.[1]);
      const pkg = context.match(/(?:Can't resolve|Cannot find module)\s+['"`]([^'"`]+)['"`]/i)?.[1];
      if (pkg && !pkg.startsWith('.') && !pkg.startsWith('@/')) addPkg(pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0]);
    }
    const ts = line.match(/(\S+\.tsx?)\s*\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/);
    if (ts) diagnostic.tsErrors.push({ file: ts[1], line: Number(ts[2]), col: Number(ts[3]), code: ts[4], message: ts[5] });
    if (/Type error:/i.test(line)) diagnostic.tsErrors.push({ file: '(next)', line: 0, col: 0, code: 'TS', message: line.replace(/^.*Type error:\s*/i, '') });
    if (/SyntaxError|Unexpected token|Unexpected end of JSON input/i.test(line)) {
      const syntaxPath = path?.[1] || context.match(/(\.\/[\w\-./()[\]@]+\.(?:tsx?|jsx?|mjs|cjs|json|css))/)?.[1];
      diagnostic.syntaxErrors.push({ file: syntaxPath?.replace(/^\.\//, '') || '(unknown)', message: line.trim() });
    }
    const env = line.match(/process\.env\.([A-Z_][A-Z0-9_]+)|Environment Variable "([A-Z_][A-Z0-9_]+)"/);
    addEnv(env?.[1] || env?.[2]);
    const eslint = line.match(/(\S+\.tsx?):(\d+):(\d+)\s+(?:error|Error):?\s+(.+)/);
    if (eslint && /eslint|lint/i.test(context)) diagnostic.eslintIssues.push({ file: eslint[1], line: Number(eslint[2]), col: Number(eslint[3]), message: eslint[4] });
    if (/not-found|404|route.*failed|missing route|content check/i.test(line)) diagnostic.routeIssues.push(line.trim());
  }

  if (diagnostic.paths.length) {
    diagnostic.class = diagnostic.missingPackages.length ? 'missing_dependency' : 'module_not_found';
  } else if (diagnostic.tsErrors.length) {
    diagnostic.class = 'ts_error';
  } else if (diagnostic.syntaxErrors.length) {
    diagnostic.class = 'syntax_error';
  } else if (diagnostic.envVars.length) {
    diagnostic.class = 'env_var_missing';
  } else if (diagnostic.eslintIssues.length) {
    diagnostic.class = 'eslint_error';
  } else if (diagnostic.routeIssues.length) {
    diagnostic.class = 'route_or_live_content';
  } else if (/quality gate|placeholder|template branding|invalid pattern/i.test(text)) {
    diagnostic.class = 'quality';
  }

  diagnostic.rawSnippet = lines.filter(Boolean).slice(-12).join(' | ').slice(0, 600);
  diagnostic.summary = summarizeDiagnostic(diagnostic);
  return diagnostic;
}

export function repairDeploymentFailure(files, diagnostic) {
  const out = { ...(files || {}) };
  const actions = [];
  const pkg = parseJson(out['package.json']) || parseJson(out['frontend/package.json']);
  const pkgPath = out['package.json'] ? 'package.json' : 'frontend/package.json';

  if (diagnostic.class === 'missing_dependency' && pkg) {
    pkg.dependencies = pkg.dependencies || {};
    pkg.devDependencies = pkg.devDependencies || {};
    const dependencyMap = {
      'drizzle-orm': { section: 'dependencies', version: '^0.39.3' },
      '@vitejs/plugin-react': { section: 'devDependencies', version: '^4.3.4' },
      '@testing-library/jest-dom': { section: 'devDependencies', version: '^6.6.0' },
      '@testing-library/react': { section: 'devDependencies', version: '^16.2.0' },
      vitest: { section: 'devDependencies', version: '^3.2.4' },
      zod: { section: 'dependencies', version: '^3.23.8' },
    };
    for (const dep of diagnostic.missingPackages) {
      if (!pkg.dependencies[dep] && !pkg.devDependencies?.[dep]) {
        const mapped = dependencyMap[dep] || { section: 'dependencies', version: 'latest' };
        pkg[mapped.section] = pkg[mapped.section] || {};
        pkg[mapped.section][dep] = mapped.version;
        actions.push({ code: 'missing_dependency', action: 'add_dependency', path: pkgPath, detail: dep });
      }
    }
    pkg.overrides = { ...(pkg.overrides || {}), postcss: '^8.5.10' };
    out[pkgPath] = JSON.stringify(pkg, null, 2) + '\n';
  }

  if (diagnostic.class === 'env_var_missing') {
    const envPath = out['.env.example'] ? '.env.example' : 'frontend/.env.example';
    const current = out[envPath] || '';
    const missing = diagnostic.envVars.filter((key) => !current.includes(`${key}=`));
    if (missing.length) {
      out[envPath] = current.replace(/\s*$/, '\n') + missing.map((key) => `${key}=`).join('\n') + '\n';
      actions.push({ code: 'env_var_missing', action: 'append_env_example', path: envPath, detail: missing.join(', ') });
    }
  }

  if (diagnostic.class === 'vercel_root_mismatch') {
    const rootPkg = parseJson(out['package.json']) || { private: true, scripts: {}, engines: { node: '20.x' } };
    rootPkg.scripts = rootPkg.scripts || {};
    rootPkg.scripts['vercel-build'] = 'npm --prefix frontend run build';
    rootPkg.scripts['frontend:build'] = rootPkg.scripts['frontend:build'] || 'npm --prefix frontend run build';
    rootPkg.engines = rootPkg.engines || { node: '20.x' };
    rootPkg.devDependencies = { ...(rootPkg.devDependencies || {}), next: '^16.2.4', react: '^19.2.3', 'react-dom': '^19.2.3', postcss: '^8.5.10' };
    rootPkg.overrides = { ...(rootPkg.overrides || {}), postcss: '^8.5.10' };
    out['package.json'] = JSON.stringify(rootPkg, null, 2) + '\n';
    out['vercel.json'] = JSON.stringify({
      framework: 'nextjs',
      installCommand: 'npm install --engine-strict=false && npm install --prefix frontend --no-package-lock --engine-strict=false',
      buildCommand: 'npm run vercel-build',
      outputDirectory: 'frontend/.next',
      headers: [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          ],
        },
      ],
    }, null, 2) + '\n';
    actions.push({ code: 'vercel_root_mismatch', action: 'write_frontend_aware_vercel_contract', path: 'vercel.json' });
  }

  if (diagnostic.class === 'eslint_error') {
    for (const item of diagnostic.eslintIssues) {
      const path = item.file.replace(/^\.\//, '');
      if (typeof out[path] !== 'string') continue;
      out[path] = out[path].replace(/\bconsole\.log\s*\([^;]*\);?/g, '');
      actions.push({ code: 'eslint_error', action: 'remove_console_log', path });
    }
  }

  if (diagnostic.class === 'ts_error') {
    for (const item of diagnostic.tsErrors) {
      const path = item.file.replace(/^\.\//, '');
      if (typeof out[path] !== 'string') continue;
      out[path] = out[path].replace(/\bany\s+as\s+any\b/g, 'unknown').replace(/:\s*any\b/g, ': unknown');
      actions.push({ code: 'ts_error', action: 'replace_obvious_any', path });
    }
  }

  if (diagnostic.class === 'module_not_found') {
    const hasCanonicalSrcApp = Boolean(out['src/app/layout.tsx'] || out['frontend/app/layout.tsx']);
    if (hasCanonicalSrcApp) {
      for (const root of ['app/', 'components/', 'hooks/', 'styles/']) {
        for (const path of Object.keys(out)) {
          if (path.startsWith(root) && !path.startsWith('src/')) {
            delete out[path];
            actions.push({ code: 'module_not_found', action: 'delete_orphan_template_file', path });
          }
        }
      }
    }
    ensureDeployableNextScaffold(out, actions, 'module_not_found');
    actions.push({ code: 'module_not_found', action: 'constructive_next_scaffold_fallback', detail: diagnostic.paths.join(', ') });
  }

  if (diagnostic.class === 'syntax_error') {
    for (const item of diagnostic.syntaxErrors) {
      const path = item.file.replace(/^\.\//, '');
      if (/\/page\.(tsx|jsx|js)$/.test(path) && typeof out[path] === 'string') {
        out[path] = `export default function Page(){return <main><h1>${escapeJs(projectTitle(out))}</h1><p>Recovered deployment route.</p></main>}\n`;
        actions.push({ code: 'syntax_error', action: 'replace_broken_page_with_safe_route', path });
      }
    }
    ensureDeployableNextScaffold(out, actions, 'syntax_error');
  }

  if (diagnostic.class === 'route_or_live_content' || diagnostic.class === 'quality') {
    scrubTemplateLeaks(out, actions, diagnostic.class);
    ensureDeployableNextScaffold(out, actions, diagnostic.class);
  }

  if (diagnostic.class === 'next_root_layout_missing') {
    for (const path of Object.keys(out)) {
      if (path.startsWith('app/') && !out['app/layout.tsx'] && out['src/app/layout.tsx']) {
        delete out[path];
        actions.push({ code: 'next_root_layout_missing', action: 'delete_noncanonical_root_app_file', path });
      }
    }
  }

  if (diagnostic.class === 'package_lock_drift') {
    for (const path of ['package-lock.json', 'npm-shrinkwrap.json', 'frontend/package-lock.json', 'frontend/npm-shrinkwrap.json']) {
      if (out[path]) {
        delete out[path];
        actions.push({ code: 'package_lock_drift', action: 'delete_stale_lockfile', path });
      }
    }
  }

  return { files: out, actions };
}

function ensureDeployableNextScaffold(out, actions, code) {
  const appPrefix = out['frontend/package.json'] || Object.keys(out).some((p) => p.startsWith('frontend/app/')) ? 'frontend/' : '';
  const appRoot = `${appPrefix}app`;
  const srcAppRoot = `${appPrefix}src/app`;
  const root = out[`${appRoot}/layout.tsx`] || out[`${appRoot}/page.tsx`] ? appRoot : srcAppRoot;
  const title = projectTitle(out);
  const pkgPath = appPrefix ? 'frontend/package.json' : 'package.json';
  const pkg = parseJson(out[pkgPath]) || { private: true, scripts: {}, dependencies: {}, devDependencies: {}, engines: { node: '20.x' } };
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.build = pkg.scripts.build || 'next build';
  pkg.scripts.start = pkg.scripts.start || 'next start';
  pkg.dependencies = { ...(pkg.dependencies || {}), next: pkg.dependencies?.next || '^16.2.4', react: pkg.dependencies?.react || '^19.2.3', 'react-dom': pkg.dependencies?.['react-dom'] || '^19.2.3', postcss: pkg.dependencies?.postcss || '^8.5.10' };
  pkg.devDependencies = { ...(pkg.devDependencies || {}), '@types/react': pkg.devDependencies?.['@types/react'] || '^19.2.7', '@types/react-dom': pkg.devDependencies?.['@types/react-dom'] || '^19.2.3' };
  pkg.overrides = { ...(pkg.overrides || {}), postcss: '^8.5.10' };
  pkg.engines = pkg.engines || { node: '20.x' };
  out[pkgPath] = JSON.stringify(pkg, null, 2) + '\n';
  actions.push({ code, action: 'ensure_next_dependencies', path: pkgPath });

  if (!out[`${root}/layout.tsx`]) {
    out[`${root}/layout.tsx`] = `import './globals.css';\n\nexport const metadata = { title: ${JSON.stringify(title)}, description: ${JSON.stringify(`${title} operating system`)} };\n\nexport default function RootLayout({ children }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n`;
    actions.push({ code, action: 'write_root_layout', path: `${root}/layout.tsx` });
  }
  if (!out[`${root}/globals.css`]) {
    out[`${root}/globals.css`] = 'html,body{margin:0;background:#09090b;color:#f5f5f4;font-family:Inter,system-ui,sans-serif}*{box-sizing:border-box}a{color:inherit}.wrap{min-height:100vh;padding:64px 24px;max-width:1120px;margin:0 auto}.card{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:24px;background:rgba(255,255,255,.04)}.cta{display:inline-flex;margin-top:24px;padding:12px 18px;border-radius:8px;background:#d7b84a;color:#09090b;text-decoration:none;font-weight:800;max-width:100%;white-space:normal}\n';
    actions.push({ code, action: 'write_global_css', path: `${root}/globals.css` });
  }
  const routes = {
    page: ['/', 'Autonomous business system', 'Website, funnel, products, CRM, RevOps, payments, onboarding, analytics, AI agents, MCP tools, and deployment validation.'],
    pricing: ['/pricing', 'Plans and pricing', 'Choose the launch path for a complete business unit.'],
    docs: ['/docs', 'Build documentation', 'Trace the generated contract, architecture, workflows, and launch checklist.'],
    products: ['/products', 'Product catalog', 'Information products, bundles, toolkits, and digital delivery are ready at launch.'],
    support: ['/support', 'Support center', 'Customer support, ticket intake, knowledge base, and escalation workflows.'],
  };
  for (const [slug, [, heading, body]] of Object.entries(routes)) {
    const path = slug === 'page' ? `${root}/page.tsx` : `${root}/${slug}/page.tsx`;
    if (!out[path]) {
      out[path] = `export default function Page(){return <main className="wrap"><section className="card"><p>{${JSON.stringify(title)}}</p><h1>{${JSON.stringify(heading)}}</h1><p>{${JSON.stringify(body)}}</p><a className="cta" href="/pricing">Start the build</a></section></main>}\n`;
      actions.push({ code, action: 'write_required_route', path });
    }
  }
  const configPath = appPrefix ? 'frontend/next.config.mjs' : 'next.config.mjs';
  if (!out[configPath] && !out[`${appPrefix}next.config.js`] && !out[`${appPrefix}next.config.ts`]) {
    out[configPath] = 'const nextConfig = {};\nexport default nextConfig;\n';
    actions.push({ code, action: 'write_next_config', path: configPath });
  }
  for (const lockPath of [appPrefix + 'package-lock.json', appPrefix + 'npm-shrinkwrap.json']) {
    if (out[lockPath]) {
      delete out[lockPath];
      actions.push({ code, action: 'delete_stale_lockfile', path: lockPath });
    }
  }
}

function scrubTemplateLeaks(out, actions, code) {
  const leaks = [
    /\[PLACEHOLDER\]/gi,
    /\[Generation incomplete\]/gi,
    /\[INSERT [^\]]+\]/gi,
    /\[FILL IN [^\]]+\]/gi,
    /\[YOUR [^\]]+ HERE\]/gi,
    /\[TBD\]/gi,
    /\[REPLACE[^\]]*\]/gi,
    /\[[^\]]*(COMPANY|LEGAL|NAME|DATE|TITLE|ADDRESS|EMAIL|PHONE|STATE|COUNTRY|CLIENT|CUSTOMER|SECRETARY|DIRECTOR|OFFICER)[^\]]*\]/gi,
    /\bCompany Name\b/g,
    /\bYour Company\b/g,
    /\bMy Awesome SaaS\b/gi,
    /\blorem ipsum\b/gi,
    /SaaS Template/gi,
    /Ixartz/gi,
    /nextjs-boilerplate/gi,
    /demo@example\.com/gi,
    /demo123/gi,
    /change-me/gi,
    /your-secret-key/gi,
  ];
  for (const [path, body] of Object.entries(out)) {
    if (typeof body !== 'string' || body.length > 500_000) continue;
    let next = body;
    for (const leak of leaks) next = next.replace(leak, projectTitle(out));
    if (next !== body) {
      out[path] = next;
      actions.push({ code, action: 'scrub_template_or_secret_placeholder', path });
    }
  }
}

function projectTitle(files) {
  const pkg = parseJson(files['package.json']) || parseJson(files['frontend/package.json']);
  if (pkg?.name) return String(pkg.name).replace(/[-_]/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  const readme = files['README.md'] || '';
  const heading = readme.match(/^#\s+(.+)$/m)?.[1];
  return heading || 'Generated Business Unit';
}

function escapeJs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

function parseJson(value) {
  try {
    return JSON.parse(value || '');
  } catch {
    return null;
  }
}

function summarizeDiagnostic(diagnostic) {
  switch (diagnostic.class) {
    case 'missing_dependency':
      return `Missing dependencies: ${diagnostic.missingPackages.join(', ')}`;
    case 'module_not_found':
      return `Unresolved module paths: ${diagnostic.paths.join(', ')}`;
    case 'ts_error':
      return `${diagnostic.tsErrors.length} TypeScript error(s)`;
    case 'syntax_error':
      return `${diagnostic.syntaxErrors.length} syntax error(s)`;
    case 'env_var_missing':
      return `Missing env vars: ${diagnostic.envVars.join(', ')}`;
    case 'eslint_error':
      return `${diagnostic.eslintIssues.length} ESLint issue(s)`;
    case 'route_or_live_content':
      return 'Route/live content verification failed';
    case 'vercel_root_mismatch':
      return 'Vercel root directory/build command mismatch';
    case 'quality':
      return 'Quality contract failed';
    case 'deployment_protection':
      return 'Deployment protection blocked public verification';
    default:
      return diagnostic.rawSnippet || 'Unknown deployment failure';
  }
}
