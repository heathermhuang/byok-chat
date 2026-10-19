import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const origin = new URL(process.env.BYOK_CHAT_BASE_URL || 'https://staging.byok.chat').origin
const request = (path, init) => fetch(origin + path, { ...init, signal: AbortSignal.timeout(30_000) })

const html = await request('/')
assert.equal(html.status, 200)
assert.match(html.headers.get('content-type'), /text\/html/)
assert.match(html.headers.get('link'), /rel="api-catalog"/)
assert.match(html.headers.get('vary'), /Accept/i)

const markdown = await request('/', { headers: { accept: 'text/markdown' } })
assert.equal(markdown.status, 200)
assert.match(markdown.headers.get('content-type'), /text\/markdown/)
assert.match(await markdown.text(), /# BYOK Chat/)
const declined = await request('/', { headers: { accept: 'text/markdown;q=0, text/html' } })
assert.match(declined.headers.get('content-type'), /text\/html/)

for (const [path, type] of [['/agent-guide.md', /text\/markdown/], ['/auth.md', /text\/markdown/], ['/llms.txt', /text\//], ['/robots.txt', /text\/plain/], ['/sitemap.xml', /application\/xml/], ['/openapi.json', /application\/json/], ['/.well-known/api-catalog', /application\/linkset\+json/], ['/.well-known/ai-catalog.json', /application\/json/]]) {
  const response = await request(path)
  assert.equal(response.status, 200, path)
  assert.match(response.headers.get('content-type'), type, path)
  const head = await request(path, { method: 'HEAD' })
  assert.equal(head.status, 200, path)
  assert.equal(await head.text(), '', path)
}

const robots = await (await request('/robots.txt')).text()
assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`))
assert.match(robots, /Content-Signal: search=yes, ai-input=yes, ai-train=no/)
const spec = await (await request('/openapi.json')).json()
assert.equal(spec.servers[0].url, origin)
assert.ok(spec.paths['/api/chat'].post)
const index = await (await request('/.well-known/agent-skills/index.json')).json()
for (const skill of index.skills) {
  assert.equal(new URL(skill.url).origin, origin)
  const response = await request(new URL(skill.url).pathname)
  assert.equal(response.status, 200)
  const content = await response.text()
  assert.equal(skill.digest, 'sha256:' + createHash('sha256').update(content).digest('hex'))
}
for (const path of ['/api', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/mcp/server-card.json', '/.well-known/agent-card.json', '/.well-known/poppy.json']) {
  const response = await request(path)
  assert.equal(response.status, 404, path)
  assert.match(response.headers.get('content-type'), /application\/json/, path)
}
const probe = await request('/api/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
assert.equal(probe.status, 400)
assert.equal((await probe.json()).error.message, 'apiKey is required')
console.log(`Agent discovery smoke passed: ${origin} (Markdown, headers, catalogs, skill digest, methods, 404s, passive API validation)`)
