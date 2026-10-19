import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import worker from '../src/worker.ts'
import { prefersMarkdown } from '../src/agent-discovery.ts'
import { registerPublicAgentTools } from '../src/lib/webmcp.ts'

const env = { ASSETS: { fetch: async () => new Response('<html>workspace</html>', { headers: { 'content-type': 'text/html', vary: 'Accept-Encoding', link: '</existing>; rel="preload"' } }) } }
const get = (path, init = {}, origin = 'https://staging.byok.chat') => worker.fetch(new Request(origin + path, init), env)

test('negotiates public Markdown while retaining HTML and cache variance', async () => {
  const markdown = await get('/', { headers: { accept: 'text/markdown' } })
  assert.equal(markdown.status, 200)
  assert.match(markdown.headers.get('content-type'), /text\/markdown/)
  assert.match(markdown.headers.get('vary'), /Accept/)
  assert.match(markdown.headers.get('link'), /rel="api-catalog"/)
  assert.match(markdown.headers.get('x-content-type-options'), /nosniff/)
  const body = await markdown.text()
  assert.match(body, /# BYOK Chat/)
  assert.match(body, /https:\/\/staging\.byok\.chat\/auth\.md/)
  const html = await get('/', { headers: { accept: 'text/html,text/markdown;q=0.5' } })
  assert.equal(await html.text(), '<html>workspace</html>')
  assert.equal(html.headers.get('vary'), 'Accept-Encoding, Accept')
  assert.match(html.headers.get('link'), /existing.*api-catalog/)
  assert.equal(prefersMarkdown('text/markdown;q=0, */*'), false)
  assert.equal(prefersMarkdown('text/html;q=1, text/markdown;q=0.1'), false)
  assert.equal(prefersMarkdown('*/*'), false)
  assert.equal(prefersMarkdown('text/markdown;q=0.8, text/*;q=0.9'), false)
  assert.equal(prefersMarkdown('TEXT/MARKDOWN; q=1, text/html;q=0.5'), true)
})

test('public resources support HEAD and reject writes', async () => {
  for (const path of ['/agent-guide.md', '/auth.md', '/llms.txt', '/robots.txt', '/sitemap.xml', '/openapi.json', '/.well-known/api-catalog', '/.well-known/agent-skills/index.json', '/.well-known/ai-catalog.json']) {
    const response = await get(path)
    assert.equal(response.status, 200, path)
    assert.notEqual(response.headers.get('content-type'), 'text/html', path)
    const head = await get(path, { method: 'HEAD' })
    assert.equal(head.status, 200, path)
    assert.equal(await head.text(), '')
    assert.equal(head.headers.get('content-type'), response.headers.get('content-type'))
    const post = await get(path, { method: 'POST' })
    assert.equal(post.status, 405, path)
    assert.equal(post.headers.get('allow'), 'GET, HEAD')
  }
})

test('unknown discovery protocols and API roots never fall through to the SPA', async () => {
  for (const path of ['/api', '/api/unknown', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/mcp/server-card.json', '/.well-known/agent-card.json', '/.well-known/poppy.json', '/.well-known/ucp']) {
    const response = await get(path)
    assert.equal(response.status, 404, path)
    assert.match(response.headers.get('content-type'), /application\/json/)
    assert.ok((await response.json()).error.message)
  }
  const legal = await get('/privacy')
  assert.equal(legal.status, 200)
  assert.equal(await legal.text(), '<html>workspace</html>')
})

test('API catalog links to real OpenAPI endpoints and local documentation', async () => {
  const response = await get('/.well-known/api-catalog')
  assert.match(response.headers.get('content-type'), /application\/linkset\+json; profile=/)
  const { linkset } = await response.json()
  const spec = await (await get('/openapi.json')).json()
  assert.equal(spec.openapi, '3.1.0')
  assert.equal(spec.servers[0].url, 'https://staging.byok.chat')
  for (const entry of linkset) {
    assert.ok(spec.paths[new URL(entry.anchor).pathname])
    for (const link of [...entry['service-desc'], ...entry['service-doc']]) assert.equal((await get(new URL(link.href).pathname)).status, 200)
  }
  assert.deepEqual(spec.paths['/api/chat'].post.requestBody.content['application/json'].schema.required, ['profile', 'messages'])
  assert.equal(spec.paths['/api/models'].post.requestBody.content['application/json'].schema.properties.apiKey.writeOnly, true)
  assert.deepEqual(spec.security, [])
})

test('published skill digests match the exact served artifact on every origin', async () => {
  for (const origin of ['https://staging.byok.chat', 'https://chat.example.org']) {
    const index = await (await get('/.well-known/agent-skills/index.json', {}, origin)).json()
    assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json')
    for (const entry of index.skills) {
      assert.equal(new URL(entry.url).origin, origin)
      const response = await get(new URL(entry.url).pathname, {}, origin)
      const content = await response.text()
      assert.equal(entry.digest, 'sha256:' + createHash('sha256').update(content).digest('hex'))
      assert.match(content, /^---\nname: use-byok-chat\n/)
      assert.match(content, /POST \/api\/chat/)
    }
  }
})

test('content policies and catalogs use the actual host and only supported capabilities', async () => {
  const robots = await (await get('/robots.txt')).text()
  assert.match(robots, /Content-Signal: search=yes, ai-input=yes, ai-train=no/)
  assert.match(robots, /Disallow: \/api\//)
  assert.match(robots, /Sitemap: https:\/\/staging\.byok\.chat\/sitemap\.xml/)
  const sitemap = await (await get('/sitemap.xml')).text()
  assert.match(sitemap, /https:\/\/staging\.byok\.chat\/privacy/)
  const auth = await (await get('/auth.md')).text()
  assert.match(auth, /^# auth.md/)
  assert.match(auth, /Registration is not required/)
  const catalogResponse = await get('/.well-known/ai-catalog.json')
  assert.equal(catalogResponse.headers.get('access-control-allow-origin'), '*')
  const catalog = await catalogResponse.json()
  for (const entry of catalog.entries) {
    assert.equal(entry.type, 'application/vnd.oai.openapi+json')
    assert.equal(Boolean(entry.url) !== Boolean(entry.data), true)
    assert.equal((await get(new URL(entry.url).pathname)).status, 200)
  }
})

test('all deployment configs route discovery through the Worker before SPA assets', () => {
  for (const path of ['wrangler.toml', 'wrangler.staging.toml', 'wrangler.example.toml']) {
    const config = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
    const routes = JSON.parse(config.match(/^run_worker_first = (.+)$/m)[1])
    for (const route of ['/', '/index.html', '/.well-known/*', '/robots.txt', '/sitemap.xml', '/auth.md', '/openapi.json', '/agent-guide.md']) assert.ok(routes.includes(route), `${path}: ${route}`)
  }
})

test('WebMCP tools return only public information and clean up on abort', async () => {
  const tools = []
  const registrations = []
  const doc = { location: { origin: 'https://staging.byok.chat' }, modelContext: { registerTool: async (tool, options) => { tools.push(tool); registrations.push(options) } } }
  const dispose = await registerPublicAgentTools(doc, {})
  assert.deepEqual(tools.map((tool) => tool.name), ['get_byok_guide', 'list_byok_providers'])
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true)
    assert.equal(tool.annotations.consequentialHint, false)
    assert.deepEqual(tool.inputSchema.properties, {})
  }
  assert.match(await tools[0].execute(), /staging\.byok\.chat\/auth\.md/)
  const providers = await tools[1].execute()
  assert.ok(providers.some((provider) => provider.id === 'openai'))
  assert.equal(JSON.stringify(providers).includes('apiKey'), false)
  assert.equal(registrations[0].signal.aborted, false)
  dispose()
  assert.equal(registrations.every(({ signal }) => signal.aborted), true)
})

test('WebMCP supports older browsers and registration failures without breaking the app', async () => {
  let registered = 0
  let signal
  const nav = { modelContext: { registerTool: async (_tool, options) => { registered++; signal = options.signal; if (registered === 2) throw new Error('Not supported') } } }
  const dispose = await registerPublicAgentTools({ location: { origin: 'https://example.org' } }, nav)
  assert.equal(registered, 2)
  assert.equal(signal.aborted, true)
  dispose()
  assert.equal(typeof await registerPublicAgentTools({}, {}), 'function')
})
