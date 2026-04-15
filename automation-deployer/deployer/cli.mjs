#!/usr/bin/env node
/**
 * Automation Deployer CLI
 *
 * Usage:
 *   automation-deployer <command> [options]
 *
 * Commands:
 *   init          Create a new tenant folder from the template.
 *   interview     Run an interactive needs assessment; writes selected-automations.yaml.
 *   plan          Produce a deployment plan (dry-run, no side effects).
 *   deploy        Execute the plan against the tenant's infra.
 *   verify        Run health checks on deployed automations.
 *   status        Show per-automation deployed state.
 *   rollback      Roll back one automation or the whole tenant.
 *   upgrade       Migrate a deployed automation to a newer manifest version.
 *   list          Print automations / categories / bundles with optional filters.
 *   validate      Validate the registry and all manifests.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const COMMANDS = {
  init: () => import('./commands/init.mjs'),
  interview: () => import('./commands/interview.mjs'),
  plan: () => import('./commands/plan.mjs'),
  deploy: () => import('./commands/deploy.mjs'),
  verify: () => import('./commands/verify.mjs'),
  status: () => import('./commands/status.mjs'),
  rollback: () => import('./commands/rollback.mjs'),
  upgrade: () => import('./commands/upgrade.mjs'),
  list: () => import('./commands/list.mjs'),
  validate: () => import('./commands/validate.mjs'),
};

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(a);
    }
  }
  return { command, args };
}

async function printHelp() {
  const pkgRaw = await readFile(join(ROOT, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  console.log(`automation-deployer v${pkg.version}\n`);
  console.log('Commands:');
  for (const c of Object.keys(COMMANDS)) console.log(`  ${c}`);
  console.log('\nRun `automation-deployer <command> --help` for details.');
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || args.help) {
    await printHelp();
    process.exit(0);
  }
  const loader = COMMANDS[command];
  if (!loader) {
    console.error(`Unknown command: ${command}`);
    await printHelp();
    process.exit(1);
  }
  const mod = await loader();
  const rc = await mod.default({ args, root: ROOT });
  process.exit(rc ?? 0);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
