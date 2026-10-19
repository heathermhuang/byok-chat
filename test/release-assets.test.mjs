import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectAssetReferences, compareDeployAssets } from '../scripts/compare-deploy-assets.mjs'

test('deploy asset headers include browser security policy', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')

  assert.match(headers, /^\/\*/m)
  assert.match(headers, /Content-Security-Policy: .*frame-ancestors 'none'/)
  assert.match(headers, /script-src 'self' https:\/\/static\.cloudflareinsights\.com/)
  assert.match(headers, /script-src .*https:\/\/www\.googletagmanager\.com/)
  assert.match(headers, /connect-src 'self' https:\/\/cloudflareinsights\.com/)
  assert.match(headers, /connect-src .*https:\/\/www\.google-analytics\.com/)
  assert.match(headers, /Cross-Origin-Opener-Policy: same-origin/)
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/)
  assert.match(headers, /Permissions-Policy: .*camera=\(\)/)
  assert.match(headers, /X-Content-Type-Options: nosniff/)
  assert.match(headers, /X-Frame-Options: DENY/)
  assert.match(headers, /Strict-Transport-Security: max-age=31536000/)
})

test('Worker deployments force global fetch through the public Internet path', () => {
  for (const file of ['wrangler.toml', 'wrangler.staging.toml', 'wrangler.example.toml']) {
    const config = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(config, /compatibility_flags = \[[^\]]*"global_fetch_strictly_public"/)
  }
})

test('collects Vite asset references from deployment HTML', () => {
  const refs = collectAssetReferences(`
    <link rel="stylesheet" href="/assets/index-abc.css">
    <script type="module" src="/assets/index-def.js"></script>
    <img src="data:image/png;base64,abc">
    <script>const name = "byok-chat-threads-\${new Date().toISOString().slice(0,10)}.json"</script>
  `, new URL('https://staging.byok.chat/'))

  assert.deepEqual(refs, [
    'https://staging.byok.chat/assets/index-abc.css',
    'https://staging.byok.chat/assets/index-def.js',
  ])
})

test('compares staging and production asset hashes', async () => {
  const bodies = new Map([
    ['https://staging.example/', '<script type="module" src="/assets/app.js"></script>'],
    ['https://production.example/', '<script type="module" src="/assets/app.js"></script>'],
    ['https://staging.example/assets/app.js', 'import("./workspace-staging.js"); console.log("staging")'],
    ['https://production.example/assets/app.js', 'import("./workspace-production.js"); console.log("production")'],
    ['https://staging.example/assets/workspace-staging.js', 'console.log("staging workspace")'],
    ['https://production.example/assets/workspace-production.js', 'console.log("production workspace")'],
  ])
  const report = await compareDeployAssets({
    stagingUrl: 'https://staging.example/',
    productionUrl: 'https://production.example/',
    fetchImpl: async (url) => new Response(bodies.get(url), { status: 200 }),
  })

  assert.equal(report.comparison.matches, false)
  assert.equal(report.comparison.htmlMatches, true)
  assert.deepEqual(report.staging.assets.map((asset) => asset.path), [
    '/assets/app.js',
    '/assets/workspace-staging.js',
  ])
  assert.equal(report.comparison.rows.find((row) => row.path === '/assets/app.js')?.status, 'diff')
  assert.equal(report.comparison.rows.find((row) => row.path === '/assets/workspace-staging.js')?.status, 'staging-only')
  assert.equal(report.comparison.rows.find((row) => row.path === '/assets/workspace-production.js')?.status, 'production-only')
})

function discoveryFetch({ changedSchema = false, changedScript = false } = {}) {
  return async (input) => {
    const url = new URL(input)
    const production = url.hostname === 'production.example'
    const body = url.pathname === '/'
      ? '<link rel="ai-catalog" href="/.well-known/ai-catalog.json"><link rel="service-desc" href="/openapi.json"><script src="/assets/app.js"></script>'
      : url.pathname === '/openapi.json'
        ? JSON.stringify({ openapi: '3.1.0', servers: [{ url: url.origin }], paths: { '/api/chat': { summary: production && changedSchema ? 'Changed API' : 'Chat' } } })
        : url.pathname === '/.well-known/ai-catalog.json'
          ? JSON.stringify({ host: { identifier: url.origin }, entries: [{ identifier: `urn:air:${url.hostname}:api:chat`, url: `${url.origin}/openapi.json` }] })
          : production && changedScript ? 'const endpoint="https://production.example"' : 'const endpoint="https://staging.example"'
    return new Response(body, { status: 200 })
  }
}

test('compares origin-specific discovery documents while preserving raw receipts', async () => {
  const report = await compareDeployAssets({ stagingUrl: 'https://staging.example/', productionUrl: 'https://production.example/', fetchImpl: discoveryFetch() })
  assert.equal(report.comparison.matches, true)
  const rows = report.comparison.rows.filter((row) => row.originNormalized)
  assert.deepEqual(rows.map((row) => row.path), ['/.well-known/ai-catalog.json', '/openapi.json'])
  assert.ok(rows.every((row) => row.stagingHash !== row.productionHash))
})

test('still rejects changed discovery schemas and changed static asset bytes', async () => {
  const report = await compareDeployAssets({ stagingUrl: 'https://staging.example/', productionUrl: 'https://production.example/', fetchImpl: discoveryFetch({ changedSchema: true, changedScript: true }) })
  assert.equal(report.comparison.matches, false)
  assert.equal(report.comparison.rows.find((row) => row.path === '/openapi.json')?.status, 'diff')
  assert.equal(report.comparison.rows.find((row) => row.path === '/assets/app.js')?.status, 'diff')
  assert.equal(report.comparison.rows.find((row) => row.path === '/.well-known/ai-catalog.json')?.status, 'match')
})
