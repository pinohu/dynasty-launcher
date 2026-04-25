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
    if (/SyntaxError|Unexpected token|Unexpected end of JSON input/i.test(line)) diagnostic.syntaxErrors.push({ file: path?.[1]?.replace(/^\.\//, '') || '(unknown)', message: line.trim() });
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
    for (const dep of diagnostic.missingPackages) {
      if (!pkg.dependencies[dep] && !pkg.devDependencies?.[dep]) {
        pkg.dependencies[dep] = 'latest';
        actions.push({ code: 'missing_dependency', action: 'add_dependency', path: pkgPath, detail: dep });
      }
    }
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
    rootPkg.devDependencies = { ...(rootPkg.devDependencies || {}), next: '^15.2.4', react: '^18.3.1', 'react-dom': '^18.3.1' };
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
    actions.push({ code: 'module_not_found', action: 'needs_constructive_regeneration', detail: diagnostic.paths.join(', ') });
  }

  return { files: out, actions };
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
