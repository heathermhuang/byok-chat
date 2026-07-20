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

test('keeps Dependabot updates grouped without reoffering incompatible releases', () => {
  const dependabot = read('.github/dependabot.yml')
  const githubActions = dependabot.slice(dependabot.indexOf('package-ecosystem: github-actions'))

  assert.match(githubActions, /groups:\s+github-actions:\s+patterns:\s+- ["']\*["']/)
  assert.match(dependabot, /dependency-name:\s+["']@assistant-ui\/react["']\s+versions:\s+- ["']0\.14\.27["']/)
})

test('keeps the assistant UI dependency graph compatible with Node 20', () => {
  const packageJson = JSON.parse(read('package.json'))
  const packageLock = JSON.parse(read('package-lock.json'))

  assert.match(packageJson.engines.node, /\^20\.19\.0/)
  assert.equal(packageJson.dependencies['@assistant-ui/react'], '^0.14.26')
  assert.equal(packageLock.packages['node_modules/@assistant-ui/core'].version, '0.2.20')
  assert.equal(packageLock.packages['node_modules/assistant-stream'].version, '0.3.25')
  assert.equal(packageLock.packages['node_modules/nanoid'].version, '5.1.16')
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
