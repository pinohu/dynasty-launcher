// agents/_lib/shell-wrapper.mjs
// Phase 4: every shell command routes through this wrapper. Rejects
// interactive commands, auto-injects non-interactive flags, and enforces
// the policy in agents/shared/policies/non-interactive-shell.md.
//
// Exported: runShell({ cmd, args, cwd?, env?, timeout_ms? })
//   → { stdout, stderr, exit_code, duration_ms }
//
// Enforces: non-zero exit on interactive prompts, no stdin reads, no editor
// commands, no sudo prompts. Wraps child_process.spawn so callers never
// manage process IO themselves.
// -----------------------------------------------------------------------------
import { spawn } from 'node:child_process';

const FORBIDDEN_CMDS = new Set([
  'vim', 'vi', 'nano', 'emacs', 'less', 'more', 'pico', 'ed', 'joe',
  'sudo', 'su', 'ssh-add', 'gpg', 'passwd',
]);

const FLAG_INJECTIONS = {
  'apt-get': ['-y'],
  'apt':     ['-y'],
  'yum':     ['-y'],
  'dnf':     ['-y'],
  'brew':    [], // brew doesn't prompt by default
  'npm':     [],
  'pnpm':    [],
  'yarn':    [],
  'gh':      [],
  'ssh':     ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'],
  'psql':    ['-v', 'ON_ERROR_STOP=1'],
};

const BLOCKED_PATTERNS = [
  /\bsudo\s+-k\b/,
  /\bread\s+[A-Z_]/,           // shell builtin 'read' waits for stdin
  />\s*\/dev\/tty\b/,
  /<\s*\/dev\/tty\b/,
];

export function preflight({ cmd, args = [] }) {
  if (FORBIDDEN_CMDS.has(cmd)) {
    return { ok: false, reason: `cmd '${cmd}' is forbidden (interactive or sensitive)` };
  }
  const full = [cmd, ...args].join(' ');
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(full)) return { ok: false, reason: `pattern matched: ${pat}` };
  }
  const inject = FLAG_INJECTIONS[cmd] || [];
  // Prepend the injection if absent.
  const finalArgs = [...args];
  for (const flag of inject) {
    if (!finalArgs.includes(flag)) finalArgs.unshift(flag);
  }
  return { ok: true, cmd, args: finalArgs };
}

export function runShell({ cmd, args = [], cwd = process.cwd(), env = process.env, timeout_ms = 60000 }) {
  return new Promise((resolve, reject) => {
    const pre = preflight({ cmd, args });
    if (!pre.ok) return reject(new Error(`shell-wrapper refused: ${pre.reason}`));

    const start = Date.now();
    const child = spawn(pre.cmd, pre.args, {
      cwd,
      env: { ...env, DEBIAN_FRONTEND: 'noninteractive', CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'], // stdin is closed — this is the whole point
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout after ${timeout_ms}ms`));
    }, timeout_ms);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exit_code: code,
        duration_ms: Date.now() - start,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
