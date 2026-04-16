#!/usr/bin/env node

/**
 * n8n-import.mjs
 *
 * Bulk-imports all n8n workflow JSON files into a running n8n instance via REST API.
 *
 * Usage:
 *   node scripts/n8n-import.mjs              # Import all workflows
 *   node scripts/n8n-import.mjs --dry-run    # List what would be imported
 *
 * Environment:
 *   N8N_API_URL    - Base URL of n8n instance (e.g., http://localhost:5678)
 *   N8N_API_KEY    - API key for authentication
 *
 * Exit codes:
 *   0 - Success
 *   1 - Configuration error or fatal failure
 *   2 - Some workflows failed to import (summary still printed)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const N8N_API_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

const WORKFLOW_DIRS = [
  path.join(ROOT, 'automations/platform-modules/n8n-workflows'),
  path.join(ROOT, 'automations/catalog/n8n-workflows'),
];

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

async function validateConfig() {
  if (!N8N_API_KEY) {
    log('Error: N8N_API_KEY environment variable not set', 'red');
    process.exit(1);
  }

  if (DRY_RUN) {
    log(`[DRY RUN] N8N_API_URL: ${N8N_API_URL}`, 'cyan');
    log(`[DRY RUN] N8N_API_KEY: ${N8N_API_KEY.substring(0, 8)}...`, 'cyan');
  } else {
    try {
      const res = await fetch(`${N8N_API_URL}/api/v1/me`, {
        headers: { 'X-N8N-API-Key': N8N_API_KEY },
      });
      if (!res.ok) {
        log(`Error: Failed to authenticate with n8n (${res.status})`, 'red');
        process.exit(1);
      }
    } catch (err) {
      log(`Error: Cannot connect to n8n at ${N8N_API_URL}: ${err.message}`, 'red');
      process.exit(1);
    }
  }
}

async function findWorkflowFiles() {
  const files = [];

  for (const dir of WORKFLOW_DIRS) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          files.push(path.join(dir, entry.name));
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log(`Warning: Cannot read ${dir}: ${err.message}`, 'yellow');
      }
    }
  }

  return files.sort();
}

async function readWorkflowFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse ${filePath}: ${err.message}`);
  }
}

async function getExistingWorkflow(name) {
  if (DRY_RUN) return null;

  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      headers: { 'X-N8N-API-Key': N8N_API_KEY },
    });

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    const data = await res.json();
    const workflow = data.data?.find((w) => w.name === name);
    return workflow || null;
  } catch (err) {
    throw new Error(`Failed to fetch existing workflows: ${err.message}`);
  }
}

async function createWorkflow(workflow) {
  if (DRY_RUN) return { id: 'DRY_RUN_ID' };

  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-Key': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workflow),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`API returned ${res.status}: ${error}`);
    }

    return await res.json();
  } catch (err) {
    throw new Error(`Failed to create workflow: ${err.message}`);
  }
}

async function updateWorkflow(id, workflow) {
  if (DRY_RUN) return { id };

  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}`, {
      method: 'PATCH',
      headers: {
        'X-N8N-API-Key': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(workflow),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`API returned ${res.status}: ${error}`);
    }

    return await res.json();
  } catch (err) {
    throw new Error(`Failed to update workflow: ${err.message}`);
  }
}

async function activateWorkflow(id) {
  if (DRY_RUN) return;

  try {
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows/${id}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-Key': N8N_API_KEY },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`API returned ${res.status}: ${error}`);
    }
  } catch (err) {
    throw new Error(`Failed to activate workflow: ${err.message}`);
  }
}

async function importWorkflow(filePath) {
  const fileName = path.basename(filePath);

  try {
    const workflow = await readWorkflowFile(filePath);
    const name = workflow.name || path.basename(filePath, '.json');

    // Check if workflow already exists
    const existing = await getExistingWorkflow(name);
    let result;

    if (existing) {
      result = await updateWorkflow(existing.id, workflow);
      log(`Updated: ${fileName} (id: ${result.id}) ✓`, 'cyan');
    } else {
      result = await createWorkflow(workflow);
      log(`Imported: ${fileName} (id: ${result.id}) ✓`, 'green');
    }

    // Activate the workflow
    await activateWorkflow(result.id);

    return { success: true, id: result.id, fileName };
  } catch (err) {
    log(`Error: ${fileName} - ${err.message}`, 'red');
    return { success: false, fileName, error: err.message };
  }
}

async function main() {
  log('='.repeat(70), 'gray');
  log('n8n Workflow Bulk Import', 'cyan');
  log('='.repeat(70), 'gray');

  await validateConfig();

  const files = await findWorkflowFiles();

  if (files.length === 0) {
    log('No workflow files found in:', 'yellow');
    WORKFLOW_DIRS.forEach((dir) => log(`  - ${dir}`, 'gray'));
    process.exit(0);
  }

  log(`Found ${files.length} workflow file(s):`, 'cyan');
  files.forEach((file) => log(`  - ${path.relative(ROOT, file)}`, 'gray'));
  log('', 'reset');

  if (DRY_RUN) {
    log('[DRY RUN] The following workflows would be imported:', 'yellow');
    log('', 'reset');
  }

  const results = [];
  for (const file of files) {
    const result = await importWorkflow(file);
    results.push(result);
  }

  // Summary
  log('', 'reset');
  log('='.repeat(70), 'gray');

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (DRY_RUN) {
    log(`[DRY RUN] Would import ${successful}/${results.length} workflows`, 'cyan');
  } else {
    log(`Imported ${successful}/${results.length} workflows`, 'green');

    if (failed > 0) {
      log(`${failed} error(s) encountered:`, 'red');
      results
        .filter((r) => !r.success)
        .forEach((r) => log(`  - ${r.fileName}: ${r.error}`, 'red'));
    }
  }

  log('='.repeat(70), 'gray');

  if (failed > 0) {
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`, 'red');
  process.exit(1);
});
