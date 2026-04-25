import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

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
  const html = fs.readFileSync(file, 'utf8')
  const lines = html.split(/\r?\n/)
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    const containsQuotedClosingTag = /^\s*['"`].*<\/script>/i.test(line)
    if (containsQuotedClosingTag) {
      failures.push({
        file,
        line: index + 1,
        reason: 'escape literal </script> as <\\/script> inside JavaScript strings',
        text: trimmed,
      })
    }
  })

  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(scriptRe)) {
    const attrs = match[1] || ''
    const code = match[2] || ''
    const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)
    const type = (typeMatch?.[1] || 'text/javascript').toLowerCase()
    const isExternal = /\bsrc\s*=/i.test(attrs)
    const isModule = type === 'module'
    const isClassicJs =
      !type ||
      type === 'text/javascript' ||
      type === 'application/javascript' ||
      type === 'application/ecmascript' ||
      type === 'text/ecmascript'

    if (isExternal || isModule || !isClassicJs) continue

    try {
      new vm.Script(code, { filename: `${file}#inline-script` })
    } catch (error) {
      const startLine = html.slice(0, match.index).split(/\r?\n/).length
      const relativeLine = Number(error?.lineNumber || 1)
      failures.push({
        file,
        line: startLine + Math.max(0, relativeLine - 1),
        reason: `inline JavaScript must parse (${error.name}: ${error.message})`,
        text: '',
      })
    }
  }
}

if (failures.length) {
  console.error('check-html-script-safety: failed')
  for (const failure of failures.slice(0, 80)) {
    console.error(`- ${failure.file}:${failure.line}: ${failure.reason}`)
  }
  if (failures.length > 80) console.error(`...and ${failures.length - 80} more`)
  process.exit(1)
}

console.log(`check-html-script-safety: ok (${htmlFiles.length} html files)`)
