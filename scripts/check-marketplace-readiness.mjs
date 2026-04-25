// scripts/check-marketplace-readiness.mjs
// Ensures marketplace modules, packs, editions, and suites are active and usable.

import fs from 'node:fs';
import path from 'node:path';
import { listActions } from '../api/events/_actions.mjs';

const root = process.cwd();
const failures = [];
const actionHandlers = new Set(listActions());

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walkJson(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJson(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function assertReady(kind, code, obj) {
  if (obj.status !== 'live') failures.push(`${kind} ${code} is not live`);
  if (obj.deployment_state !== 'active') failures.push(`${kind} ${code} is not active`);
  if (obj.marketplace_ready !== true) failures.push(`${kind} ${code} is not marketplace_ready`);
  if (obj.ready_for_use !== true) failures.push(`${kind} ${code} is not ready_for_use`);
}

const moduleFiles = walkJson(path.join(root, 'product', 'modules'));
const modulesByCode = new Map();
for (const file of moduleFiles) {
  const module = readJson(file);
  const code = module.module_code || path.basename(file, '.json');
  modulesByCode.set(code, module);
  assertReady('module', code, module);

  const workflowFile = path.join(root, 'templates', 'workflow-templates', code, 'workflow.json');
  if (!fs.existsSync(workflowFile)) {
    failures.push(`module ${code} is missing workflow template`);
    continue;
  }

  const workflow = readJson(workflowFile);
  if (workflow.module_code !== code || !workflow.trigger || !workflow.trigger.event) {
    failures.push(`module ${code} workflow is missing module_code or trigger.event`);
  }
  if (!Array.isArray(workflow.actions) || workflow.actions.length === 0) {
    failures.push(`module ${code} workflow has no actions`);
  }
  for (const step of workflow.actions || []) {
    if (!step.action || !actionHandlers.has(step.action)) {
      failures.push(`module ${code} workflow action has no handler: ${step.action || '<missing>'}`);
    }
  }
}

const bundleFiles = walkJson(path.join(root, 'product', 'bundles'));
const bundlesByCode = new Map();
for (const file of bundleFiles) {
  const bundle = readJson(file);
  const code = bundle.bundle_code || path.basename(file, '.json');
  bundlesByCode.set(code, bundle);
  assertReady('bundle', code, bundle);
  for (const moduleCode of bundle.modules || []) {
    if (!modulesByCode.has(moduleCode)) failures.push(`bundle ${code} references missing module ${moduleCode}`);
  }
}

const tiers = readJson(path.join(root, 'product', 'pricing', 'tiers.json'));
for (const edition of tiers.editions || []) {
  const code = edition.edition_code || edition.name;
  assertReady('edition', code, edition);
  const includes = edition.includes || {};
  const suiteCodes = includes.suites === 'all' ? (tiers.suites || []).map((s) => s.suite_code) : (includes.suites || []);
  const packCodes = includes.packs === 'all' ? [...bundlesByCode.keys()] : (includes.packs || []);
  for (const suiteCode of suiteCodes) {
    if (!(tiers.suites || []).some((s) => s.suite_code === suiteCode)) failures.push(`edition ${code} references missing suite ${suiteCode}`);
  }
  for (const packCode of packCodes) {
    if (!bundlesByCode.has(packCode)) failures.push(`edition ${code} references missing pack ${packCode}`);
  }
}
for (const suite of tiers.suites || []) {
  const code = suite.suite_code || suite.name;
  assertReady('suite', code, suite);
  for (const packCode of suite.packs || []) {
    if (!bundlesByCode.has(packCode)) failures.push(`suite ${code} references missing pack ${packCode}`);
  }
  for (const extraCode of suite.extras || []) {
    if (!modulesByCode.has(extraCode)) failures.push(`suite ${code} extra ${extraCode} is not an activatable module`);
  }
}

const blueprintFiles = walkJson(path.join(root, 'product', 'blueprints'));
for (const file of blueprintFiles) {
  const blueprint = readJson(file);
  const code = blueprint.blueprint_code || path.basename(file, '.json');
  for (const moduleCode of blueprint.recommended_modules || []) {
    const module = modulesByCode.get(moduleCode);
    if (!module) failures.push(`blueprint ${code} recommends missing module ${moduleCode}`);
    else if (module.status !== 'live' || module.ready_for_use !== true) {
      failures.push(`blueprint ${code} recommends non-ready module ${moduleCode}`);
    }
  }
  for (const packCode of blueprint.recommended_bundles || []) {
    if (!bundlesByCode.has(packCode)) failures.push(`blueprint ${code} recommends missing pack ${packCode}`);
  }
}

if (failures.length) {
  console.error('Marketplace readiness failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Marketplace readiness PASS: ${moduleFiles.length} modules, ${bundleFiles.length} bundles, ${(tiers.editions || []).length} editions, ${(tiers.suites || []).length} suites.`);
