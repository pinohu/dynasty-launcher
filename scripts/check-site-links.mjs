import fs from 'node:fs'
import path from 'node:path'

const roots = ['public', '.']
const htmlFiles = []

function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      walk(full)
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(full)
    }
  }
}

for (const root of roots) {
  if (root === '.') {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(entry.name)
    }
  } else {
    walk(root)
  }
}

function isIgnoredHref(href) {
  return (
    !href ||
    href.startsWith('#') ||
    href.startsWith('data:') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:') ||
    href.includes('${') ||
    href.includes('||') ||
    href.endsWith('.md') ||
    /^https?:\/\//.test(href) ||
    href.startsWith('/api/')
  )
}

function routeExists(href) {
  if (isIgnoredHref(href)) return true
  const [withoutHash] = href.split('#')
  const [withoutQuery] = withoutHash.split('?')
  if (!withoutQuery || withoutQuery === '/') return true

  const rel = withoutQuery.replace(/^\/+/, '')
  const publicCandidates = [
    path.join('public', rel),
    path.join('public', `${rel}.html`),
    path.join('public', rel, 'index.html'),
  ]
  const candidates = href.startsWith('/')
    ? publicCandidates
    : [
        ...publicCandidates,
        rel,
        `${rel}.html`,
        path.join(rel, 'index.html'),
      ]
  return candidates.some((candidate) => fs.existsSync(candidate))
}

const failures = []
const attrRe = /\b(?:href|src)=["']([^"']+)["']/g

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  let match
  while ((match = attrRe.exec(html))) {
    const href = match[1]
    if (!routeExists(href)) failures.push({ file, href })
  }
}

const uniqueFailures = Array.from(
  new Map(failures.map((failure) => [`${failure.file}|${failure.href}`, failure])).values(),
)

if (uniqueFailures.length) {
  console.error('check-site-links: failed')
  for (const failure of uniqueFailures.slice(0, 80)) {
    console.error(`- ${failure.file}: ${failure.href}`)
  }
  if (uniqueFailures.length > 80) console.error(`...and ${uniqueFailures.length - 80} more`)
  process.exit(1)
}

console.log(`check-site-links: ok (${htmlFiles.length} html files)`)
