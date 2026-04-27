// scripts/check-admin-ui-security.mjs
// -----------------------------------------------------------------------------
// Regression checks for admin dashboard browser hardening.
// The dashboard still has static inline handlers from the legacy page, but
// API-derived rows must be escaped and dynamic row actions must not compile
// untrusted IDs/emails into inline JavaScript.
// -----------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FILES = ['admin.html', 'public/admin.html'];
const APP_FILES = ['app.html', 'public/app.html'];

function fail(message) {
  console.error(`admin-ui-security: ${message}`);
  process.exit(1);
}

for (const file of FILES) {
  const full = path.join(ROOT, file);
  const html = fs.readFileSync(full, 'utf8');

  if (!html.includes('function escapeHtml(') || !html.includes('function safeHtml(')) {
    fail(`${file} is missing HTML escaping helpers`);
  }
  if (html.includes('banner.innerHTML')) {
    fail(`${file} renders auth errors with innerHTML`);
  }
  if (
    html.includes("localStorage.getItem('dynasty_admin_token'") ||
    html.includes("localStorage.setItem('dynasty_admin_token'")
  ) {
    fail(`${file} stores admin tokens in localStorage`);
  }
  if (
    !html.includes("sessionStorage.getItem('dynasty_admin_token')") ||
    !html.includes("localStorage.removeItem('dynasty_admin_token')")
  ) {
    fail(`${file} does not keep admin tokens session-only and purge legacy localStorage`);
  }
  if (html.includes('onclick="deleteUser(') || html.includes('onchange="updateTier(')) {
    fail(`${file} still compiles customer data into inline event handlers`);
  }
  if (html.includes('onclick="redeploy(') || html.includes('onclick="deleteProject(')) {
    fail(`${file} still compiles project data into inline event handlers`);
  }
  for (const expected of [
    'safeHtml`<tr><td>${u.email',
    'safeHtml`<tr><td>${s.email',
    'safeHtml`<tr><td><strong>${b.project_slug',
    'healthDetailHtml(check)',
    'safeUrl(p.url)',
  ]) {
    if (!html.includes(expected)) fail(`${file} is missing expected sanitized render: ${expected}`);
  }
}

for (const file of APP_FILES) {
  const full = path.join(ROOT, file);
  const html = fs.readFileSync(full, 'utf8');
  if (
    html.includes("localStorage.getItem('dynasty_admin_token'") ||
    html.includes("localStorage.setItem('dynasty_admin_token'")
  ) {
    fail(`${file} stores or reads admin tokens in localStorage`);
  }
  for (const expected of [
    'function getAdminToken()',
    "sessionStorage.getItem('dynasty_admin_token')",
    "sessionStorage.setItem('dynasty_admin_token', token)",
    "localStorage.removeItem('dynasty_admin_token')",
  ]) {
    if (!html.includes(expected))
      fail(`${file} is missing session-only admin-token helper: ${expected}`);
  }
}

console.log('admin-ui-security: ok');
