import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('expands BYOK at every public first-touch surface', () => {
  assert.match(read('src/App.tsx'), /BYOK = Bring Your Own Key/)
  assert.match(read('src/App.tsx'), /<p>Bring Your Own Key<\/p>/)
  assert.match(read('index.html'), /BYOK Chat · Bring Your Own Key/)
  assert.match(read('public/site.webmanifest'), /Bring Your Own Key/)
  assert.match(read('README.md'), /BYOK means \*\*Bring Your Own Key\*\*/)
})

test('keeps trust copy aligned with the documented request path', () => {
  const endpointForm = read('src/components/EndpointForm.tsx')
  const securityModel = read('docs/SECURITY_MODEL.md')

  assert.match(endpointForm, /stored in this browser/i)
  assert.match(endpointForm, /Cloudflare Worker in memory/i)
  assert.match(endpointForm, /server-side chat archive/i)
  assert.match(securityModel, /active provider key and request content pass through the Worker in memory/i)
})

test('keeps recovery and diagnostic detail progressive', () => {
  const assistant = read('src/components/ByokAssistant.tsx')
  const runMeta = read('src/components/assistant/RunMetaBar.tsx')

  assert.match(assistant, /> Retry<\/button>/)
  assert.match(assistant, /Choose another model/)
  assert.match(assistant, /Endpoint settings/)
  assert.match(assistant, /<details className="tool-details">/)
  assert.match(runMeta, /if \(!items\.length\) return null/)
  assert.doesNotMatch(runMeta, /tokens n\/a/)
})

test('keeps two-line provider choices contained on short desktop screens', () => {
  const styles = read('src/styles.css')
  const shortDesktopStart = styles.indexOf('@media (max-height: 760px) and (min-width: 821px)')
  const shortDesktopEnd = styles.indexOf('@media (prefers-reduced-motion: reduce)', shortDesktopStart)
  const shortDesktopRules = styles.slice(shortDesktopStart, shortDesktopEnd)

  assert.notEqual(shortDesktopStart, -1)
  assert.notEqual(shortDesktopEnd, -1)
  assert.match(shortDesktopRules, /\.provider-chip\s*\{[\s\S]*?min-height:\s*48px;/)
  assert.match(shortDesktopRules, /\.provider-chip\s*\{[\s\S]*?height:\s*auto;/)
  assert.doesNotMatch(shortDesktopRules, /\.provider-chip,[\s\S]*?height:\s*38px;/)
})

test('keeps install and sharing metadata aligned with the public brand', () => {
  const html = read('index.html')
  const manifest = JSON.parse(read('public/site.webmanifest'))
  const favicon = read('public/favicon.svg')

  assert.equal(manifest.name, 'BYOK Chat')
  assert.equal(manifest.short_name, 'BYOK')
  assert.equal(manifest.theme_color, '#0d5b4d')
  assert.match(html, new RegExp(`<meta name="theme-color" content="${manifest.theme_color}"`))
  assert.match(html, /<meta property="og:title" content="BYOK Chat · Bring Your Own Key"/)
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/)
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest"/)
  assert.equal(manifest.icons[0]?.src, '/favicon.svg')
  assert.match(favicon, /aria-label="BYOK Chat key mark"/)
  assert.match(favicon, /fill="#0d5b4d"/)
})
