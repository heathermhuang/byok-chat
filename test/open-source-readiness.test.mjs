import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const root = fileURLToPath(new URL('../', import.meta.url))
const ignoredDirectories = new Set(['.git', '.gstack', '.wrangler', 'dist', 'node_modules'])
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml'])

function publicTextFiles(directory = root) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...publicTextFiles(resolve(directory, entry.name)))
      continue
    }
    if (textExtensions.has(extname(entry.name)) || entry.name.startsWith('.env') || entry.name === '.gitignore') {
      files.push(resolve(directory, entry.name))
    }
  }
  return files
}

test('ships public contribution and security governance', () => {
  for (const file of [
    'README.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'LICENSE',
    'SECURITY.md',
    'docs/SECURITY_MODEL.md',
    'OPEN_SOURCE_CHECKLIST.md',
  ]) {
    assert.ok(read(file).trim().length > 100, `${file} should contain substantive guidance`)
  }

  assert.match(read('SECURITY.md'), /security\/advisories\/new/)
  assert.match(read('CONTRIBUTING.md'), /npm test/)
  assert.match(read('README.md'), /wrangler\.example\.toml/)
  assert.match(read('README.md'), /Apache License 2\.0/)
  assert.match(read('LICENSE'), /Apache License\s+Version 2\.0, January 2004/)
  assert.equal(JSON.parse(read('package.json')).license, 'Apache-2.0')
})

test('keeps the official legal identity explicit and separate from self-hosting defaults', () => {
  const officialEnv = read('.env.official')
  const packageJson = JSON.parse(read('package.json'))

  assert.match(officialEnv, /^VITE_OPERATOR_NAME="Heatherm Huang"$/m)
  assert.match(officialEnv, /^VITE_LEGAL_CONTACT_EMAIL=heathermhuang@gmail\.com$/m)
  assert.match(packageJson.scripts['build:official'], /--mode official/)
  assert.match(packageJson.scripts['deploy:self-hosted'], /verify:public-env/)
  assert.match(packageJson.scripts['deploy:staging'], /verify:official-env/)
  assert.match(packageJson.scripts['deploy:production'], /verify:official-env/)
})

test('pins every third-party workflow action to an immutable commit', () => {
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/codeql.yml']) {
    const workflow = read(file)
    const references = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g)].map((match) => match[1])
    assert.ok(references.length > 0, `${file} should use at least one action`)
    for (const reference of references) {
      assert.match(reference, /^[a-f0-9]{40}$/, `${file} contains a mutable action reference`)
    }
  }
})

test('groups GitHub Actions updates into one Dependabot pull request', () => {
  const dependabot = read('.github/dependabot.yml')
  const githubActions = dependabot.slice(dependabot.indexOf('package-ecosystem: github-actions'))

  assert.match(githubActions, /groups:\s+github-actions:\s+patterns:\s+- ["']\*["']/)
})

test('enforces dependency engine compatibility in public CI', () => {
  const ci = read('.github/workflows/ci.yml')
  const packageJson = JSON.parse(read('package.json'))

  assert.equal(packageJson.engines.node, '^22.13.0 || >=24.0.0')
  assert.match(ci, /node: \[22\.13\.0, 24\.x\]/)
  assert.doesNotMatch(ci, /run:\s+npm ci\s*$/m)
  assert.match(ci, /run:\s+npm ci --engine-strict/)
})

test('keeps known private release metadata out of the public tree', () => {
  const combined = publicTextFiles().map((file) => readFileSync(file, 'utf8')).join('\n')
  const privateHome = ['/Users', 'heatherm'].join('/')
  const privateEndpoint = new RegExp(`${['sg', 'codex'].join('-')}|${['vpn', 'vc'].join('\\.')}`, 'i')
  const injectedMemory = ['<claude', 'mem', 'context>'].join('-')

  assert.equal(combined.includes(privateHome), false)
  assert.doesNotMatch(combined, privateEndpoint)
  assert.equal(combined.includes(injectedMemory), false)
})
