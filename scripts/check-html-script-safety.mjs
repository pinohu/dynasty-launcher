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

const failures = []

for (const file of htmlFiles) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, index) => {
    const containsQuotedClosingTag = /^\s*['"`].*<\/script>/i.test(line)
    if (containsQuotedClosingTag) {
      failures.push({ file, line: index + 1, text: trimmed })
    }
  })
}

if (failures.length) {
  console.error('check-html-script-safety: failed')
  for (const failure of failures.slice(0, 80)) {
    console.error(`- ${failure.file}:${failure.line}: escape literal </script> as <\\/script> inside JavaScript strings`)
  }
  if (failures.length > 80) console.error(`...and ${failures.length - 80} more`)
  process.exit(1)
}

console.log(`check-html-script-safety: ok (${htmlFiles.length} html files)`)
