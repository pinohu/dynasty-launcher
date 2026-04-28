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
const OBSERVABILITY_FILES = ['observability.html', 'public/observability.html'];
const SIGN_IN_FILES = ['sign-in.html', 'public/sign-in.html'];

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
  if (html.includes("localStorage.setItem('dynasty_paid_token'")) {
    fail(`${file} stores paid access tokens in localStorage`);
  }
  for (const expected of [
    'function getPaidAccessToken()',
    "sessionStorage.getItem('dynasty_paid_token')",
    "sessionStorage.setItem('dynasty_paid_token', token)",
    "localStorage.removeItem('dynasty_paid_token')",
  ]) {
    if (!html.includes(expected))
      fail(`${file} is missing session-only paid-token helper: ${expected}`);
  }
  for (const expected of [
    'function safeUrl(',
    '${escapeHtml(b.name)}',
    'const liveUrl = b.live_url ? safeUrl(b.live_url) :',
    'const link = (url) => url ?',
  ]) {
    if (!html.includes(expected))
      fail(`${file} is missing sanitized app history rendering: ${expected}`);
  }
  for (const forbidden of [
    '${b.name}</td>',
    '"+b.live_url+"',
    "' + a.live_url + '",
    "' + b.live_url + '",
  ]) {
    if (html.includes(forbidden))
      fail(`${file} still renders build history unsafely: ${forbidden}`);
  }
}

for (const file of SIGN_IN_FILES) {
  const full = path.join(ROOT, file);
  const html = fs.readFileSync(full, 'utf8');
  if (html.includes("localStorage.setItem('dynasty_paid_token'")) {
    fail(`${file} stores paid access tokens in localStorage`);
  }
  if (
    !html.includes("sessionStorage.setItem('dynasty_paid_token'") ||
    !html.includes("localStorage.removeItem('dynasty_paid_token')")
  ) {
    fail(`${file} does not keep recovered paid tokens session-scoped`);
  }
}

for (const file of OBSERVABILITY_FILES) {
  const full = path.join(ROOT, file);
  const html = fs.readFileSync(full, 'utf8');
  if (!html.includes('function escapeHtml(') || !html.includes('function safeHtml(')) {
    fail(`${file} is missing HTML escaping helpers`);
  }
  if (!html.includes("sessionStorage.getItem('dynasty_admin_token')")) {
    fail(`${file} does not read admin sessions from sessionStorage`);
  }
  if (!html.includes("sessionStorage.setItem('dynasty_admin_token',adminToken)")) {
    fail(`${file} does not store verified admin sessions in sessionStorage`);
  }
  if (!html.includes("localStorage.removeItem('yd_admin_key')")) {
    fail(`${file} does not purge the legacy raw admin key from localStorage`);
  }
  if (!html.includes("fetch('/api/auth?action=verify_admin'")) {
    fail(`${file} does not exchange raw admin keys for signed admin sessions`);
  }
  if (!html.includes("'Authorization':`Bearer ${adminToken}`")) {
    fail(`${file} does not call admin observability APIs with bearer sessions`);
  }
  for (const forbidden of [
    "localStorage.getItem('yd_admin_key'",
    'localStorage.setItem(KEY_NAME',
    "'x-admin-key':adminKey",
    'adminKey=',
    '+d.error+',
    '+r.event_type+',
    '+JSON.stringify(r.payload)+',
  ]) {
    if (html.includes(forbidden))
      fail(`${file} still contains unsafe observability pattern: ${forbidden}`);
  }
}

console.log('admin-ui-security: ok');
