// scripts/verify-product-alignment.mjs — enforced alignment: TIER_MODULES, catalog counts, maturity parity, banned phrases on warranted HTML
import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

function read(p) {
  return fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n")
}

function sha256File(rel) {
  return crypto.createHash("sha256").update(read(rel)).digest("hex")
}

function extractTierModules(provisionText) {
  const anchor = "const TIER_MODULES = {"
  const start = provisionText.indexOf(anchor)
  assert.ok(start >= 0, "TIER_MODULES anchor missing in api/provision.js")
  const tail = provisionText.slice(start)
  const endMarker = "\n    const bypassStripeVerify"
  const end = tail.indexOf(endMarker)
  assert.ok(end > 0, "TIER_MODULES block end marker missing")
  const block = tail.slice(0, end)
  const tiers = {}
  for (const line of block.split("\n")) {
    const m = line.match(
      /^\s+(free|blueprint|scoring_pro|strategy_pack|foundation|starter|professional|enterprise|managed|custom_volume):\s*\[([^\]]*)\]/,
    )
    if (!m) continue
    const inner = m[2].trim()
    const mods = inner
      ? inner
          .split(",")
          .map((s) => s.trim())
          .map((s) => s.replace(/^['"]|['"]$/g, ""))
          .filter(Boolean)
      : []
    tiers[m[1]] = mods
  }
  return tiers
}

function extractCategoryKeys(catalogText) {
  const marker = "// Automation package groupings for tier-based deployment"
  const markerIdx = catalogText.indexOf(marker)
  assert.ok(markerIdx > 0, "CATEGORIES end marker comment not found")
  const blockStart = catalogText.lastIndexOf("const CATEGORIES = {", markerIdx)
  assert.ok(blockStart >= 0 && blockStart < markerIdx, "CATEGORIES start not found")
  const block = catalogText.slice(blockStart, markerIdx)
  const keys = []
  for (const line of block.split("\n")) {
    const m = line.match(/^\s+(\d+):/)
    if (m) keys.push(Number(m[1]))
  }
  return keys.sort((a, b) => a - b)
}

function countTopLevelAutomations(catalogText) {
  const matches = catalogText.match(/^\s{2}\{\s*id:/gm)
  return matches ? matches.length : 0
}

function walkHtmlFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name === ".git") continue
    const p = path.join(dir, name.name)
    if (name.isDirectory()) walkHtmlFiles(p, acc)
    else if (name.name.endsWith(".html")) acc.push(p)
  }
  return acc
}

const BANNED = [
  { re: /\bzero-touch\b/i, msg: "banned phrase: zero-touch" },
  { re: /tireless digital employee/i, msg: "banned phrase: tireless digital employee" },
  { re: /24\/7 without manual intervention/i, msg: "banned phrase: 24/7 without manual intervention" },
]

function scanBanned(relPath) {
  const text = read(relPath)
  for (const { re, msg } of BANNED) {
    assert.ok(!re.test(text), `${relPath}: ${msg}`)
  }
}

function main() {
  const provision = read("api/provision.js")
  const tiers = extractTierModules(provision)

  assert.deepEqual(tiers.foundation, tiers.professional, "foundation and professional TIER_MODULES arrays must match")
  assert.equal(tiers.foundation.length, 11, "foundation must have 11 modules")
  assert.equal(tiers.enterprise.length, 13, "enterprise must have 13 modules")
  assert.equal(tiers.managed.length, 13, "managed must have 13 modules")
  assert.equal(tiers.custom_volume.length, 19, "custom_volume must have 19 modules")
  assert.ok(tiers.enterprise.includes("wordpress"), "enterprise must include wordpress")
  assert.ok(tiers.enterprise.includes("verify"), "enterprise must include verify")

  const checkout = read("api/checkout.js")
  assert.ok(
    checkout.includes("same 11-slot allowlist as Professional in api/provision.js"),
    "checkout foundation/starter desc must mention 11-slot parity with Professional",
  )
  assert.ok(
    checkout.includes("13 total") || checkout.includes("13-slot"),
    "checkout enterprise desc must mention 13 total or 13-slot",
  )
  assert.ok(
    checkout.includes("19-slot") || checkout.includes("Custom Volume"),
    "checkout enterprise desc must gate Custom Volume / 19-slot",
  )

  const catalog = read("api/automation-catalog.js")
  assert.equal(countTopLevelAutomations(catalog), 353, "automation-catalog must define 353 top-level { id: … } workflows")
  const catKeys = extractCategoryKeys(catalog)
  assert.equal(catKeys.length, 45, "CATEGORIES must have 45 entries")
  assert.deepEqual(catKeys, Array.from({ length: 45 }, (_, i) => i + 1), "CATEGORIES keys must be 1..45 contiguous")

  const hRoot = sha256File("maturity.html")
  const hPub = sha256File("public/maturity.html")
  assert.equal(hRoot, hPub, "maturity.html and public/maturity.html must be identical (deploy parity)")

  const maturity = read("maturity.html")
  assert.ok(maturity.includes("same 11-slot"), "maturity.html must document 11-slot Foundation/Professional parity")
  assert.ok(maturity.includes("13"), "maturity.html must document Enterprise 13-slot context")
  assert.ok(maturity.includes("19-slot"), "maturity.html must document Custom Volume 19-slot")

  const readme = read("README.md")
  assert.ok(readme.includes("11-slot"), "README must mention 11-slot allowlist")
  assert.ok(readme.includes("mod_verify"), "README module table must list mod_verify")
  assert.ok(readme.includes("mod_vertical_tool"), "README module table must list mod_vertical_tool")

  const warrantedRootHtml = ["index.html", "terms.html", "marketplace.html", "maturity.html"]
  for (const f of warrantedRootHtml) scanBanned(f)

  const publicDir = path.join(root, "public")
  for (const abs of walkHtmlFiles(publicDir)) {
    const rel = path.relative(root, abs).split(path.sep).join("/")
    scanBanned(rel)
  }

  scanBanned("README.md")
  scanBanned("manifest.json")
  scanBanned("doc/START-HERE.md")
  scanBanned("generate-landing-pages.cjs")

  const pubIndex = read("public/index.html")
  assert.ok(
    pubIndex.includes("11-slot") || pubIndex.includes("same 11"),
    "public/index.html must mention Foundation/Professional 11-slot parity",
  )

  console.log("verify-product-alignment: ok")
}

main()
