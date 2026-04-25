import fs from 'node:fs'

const files = ['app.html', 'public/app.html']

const requiredSnippets = [
  ['auth button', 'id="auth-btn"'],
  ['quick mode card', 'id="mode-quick"'],
  ['strategic mode card', 'id="mode-strategic"'],
  ['wizard view button', 'id="vt-wizard"'],
  ['scroll view button', 'id="vt-scroll"'],
  ['sign-in handler', 'function handleSignIn()'],
  ['mode handler', 'function selectMode(mode)'],
  ['view handler', 'function selectView(view)'],
  ['entry control binder', 'function bindBuilderEntryControls()'],
  ['auth click binding', "authBtn.addEventListener('click', handleSignIn)"],
  ['quick click binding', "quickCard.addEventListener('click', () => selectMode('quick'))"],
  ['strategic click binding', "strategicCard.addEventListener('click', () => selectMode('strategic'))"],
  ['wizard click binding', "wizardBtn.addEventListener('click', () => selectView('wizard'))"],
  ['scroll click binding', "scrollBtn.addEventListener('click', () => selectView('scroll'))"],
]

const forbiddenPatterns = [
  ['auth inline onclick', /id="auth-btn"[^>]*\sonclick=/],
  ['quick inline onclick', /id="mode-quick"[^>]*\sonclick=/],
  ['strategic inline onclick', /id="mode-strategic"[^>]*\sonclick=/],
  ['wizard inline onclick', /id="vt-wizard"[^>]*\sonclick=/],
  ['scroll inline onclick', /id="vt-scroll"[^>]*\sonclick=/],
]

const failures = []

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8')

  for (const [label, snippet] of requiredSnippets) {
    if (!html.includes(snippet)) {
      failures.push(`${file}: missing ${label}`)
    }
  }

  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(html)) {
      failures.push(`${file}: remove ${label}; bind this control from bindBuilderEntryControls()`)
    }
  }
}

if (failures.length) {
  console.error('check-builder-clickability: failed')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`check-builder-clickability: ok (${files.length} app files)`)
