import { agentGuide } from './lib/agent-info.ts'

const SKILL_PATH = '/.well-known/agent-skills/use-byok-chat/SKILL.md'

function skill(origin: string): string {
  return `---
name: use-byok-chat
description: Connect a user-owned AI provider to BYOK Chat and understand its HTTP API and privacy boundaries.
---

${agentGuide(origin)}

## HTTP requests

Read /openapi.json for request schemas. All operational routes are POST-only JSON.
For chat, POST /api/chat with profile containing provider, baseUrl, apiKey and
model, plus messages containing role and content. This returns JSON, not SSE.
Use a key the user explicitly authorizes for that provider and destination.
The key belongs in the JSON body, never a URL. Do not reuse another site's keys.
No BYOK Chat registration, OAuth token or server-side conversation API exists.
Search and URL reader calls transmit data to configured services; get user
authorization before making these calls. Diagnostics can send a billable prompt.
For passive validation, POST {} to /api/models and expect HTTP 400 with
error.message equal to "apiKey is required"; this does not contact a provider.
`
}

function authMarkdown(origin: string): string {
  return `# auth.md — BYOK Chat

## Audience and authentication method

For agents assisting a user with their own provider account. This origin has no
BYOK Chat accounts, registration or provisioning endpoints, OAuth issuer, token
endpoint, supported OAuth scopes or credential issuance. Registration is not required.
The supported method is a user-supplied provider API key in the JSON request body.

## Credential use

The user obtains a key from their chosen provider. Do not create accounts, request
keys, inspect browser storage or send a key without their authorization.
POST /api/models accepts {"provider":"openai","baseUrl":"https://api.openai.com/v1","apiKey":"USER_SUPPLIED_KEY"}.
POST /api/chat accepts {"profile":{"provider":"openai","baseUrl":"https://api.openai.com/v1","apiKey":"USER_SUPPLIED_KEY","model":"USER_SELECTED_MODEL"},"messages":[{"role":"user","content":"Hello"}]}.
These are examples only; the placeholders are not usable credentials.
The Worker forwards active credentials to the selected HTTPS public provider
using its required authentication scheme. A BYOK Chat Bearer token or cookie is
not used. Secrets must never appear in request URLs or public discovery data.
Operational responses use Cache-Control: no-store. Provider usage may incur charges.
Revoke a compromised provider key in that provider's account; clearing local
browser storage does not revoke it at the provider.

## References

- [OpenAPI schemas](${origin}/openapi.json)
- [Setup and privacy boundaries](${origin}/agent-guide.md)
- [Privacy policy](${origin}/privacy)
`
}

export const DISCOVERY_LINKS = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  '</agent-guide.md>; rel="describedby"; type="text/markdown"',
  '</.well-known/ai-catalog.json>; rel="ai-catalog"; type="application/json"',
].join(', ')

export function withDiscoveryHeaders(response: Response, request: Request): Response {
  const path = new URL(request.url).pathname
  if (path !== '/' && path !== '/index.html') return response
  const headers = new Headers(response.headers)
  headers.append('link', DISCOVERY_LINKS)
  const vary = headers.get('vary')?.split(',').map((value) => value.trim()) || []
  if (!vary.some((value) => value.toLowerCase() === 'accept')) vary.push('Accept')
  headers.set('vary', vary.join(', '))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

// Negotiate explicit Markdown requests without changing normal browser navigation.
export function prefersMarkdown(accept: string): boolean {
  const ranges = accept.toLowerCase().split(',').map((range) => {
    const [type, ...params] = range.trim().split(';')
    const q = params.find((param) => param.trim().startsWith('q='))?.trim().slice(2)
    const quality = q === undefined ? 1 : Number(q)
    return { type, quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0 }
  })
  const markdown = Math.max(0, ...ranges.filter(({ type }) => type === 'text/markdown').map(({ quality }) => quality))
  const html = ranges.find(({ type }) => type === 'text/html')?.quality
    ?? ranges.find(({ type }) => type === 'text/*')?.quality
    ?? ranges.find(({ type }) => type === '*/*')?.quality ?? 0
  return markdown > 0 && markdown >= html
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

export function openApi(origin: string) {
  const text = { type: 'string' }
  const credentials = { provider: text, baseUrl: { type: 'string', format: 'uri', description: 'HTTPS public provider API base URL.' }, apiKey: { type: 'string', writeOnly: true, description: 'User-authorized provider key. Never log this value.' } }
  const profile = objectSchema({ ...credentials, model: text, systemPrompt: text, defaultAssistantInstructions: { type: 'boolean' }, generationParams: { type: 'object' }, searchApiKey: { type: 'string', writeOnly: true } }, ['baseUrl', 'apiKey', 'model'])
  const message = objectSchema({ role: { enum: ['user', 'assistant', 'system'] }, content: text, attachments: { type: 'array', items: { type: 'object' } } }, ['role', 'content'])
  const routes: Array<[string, string, string, unknown]> = [
    ['/api/models', 'listModels', 'Fetch provider models with a user-supplied key.', objectSchema(credentials, ['baseUrl', 'apiKey'])],
    ['/api/chat', 'sendChat', 'Send a billable provider request; returns JSON, not SSE. Tools require explicit enabled and allow settings.', objectSchema({ profile, messages: { type: 'array', items: message }, tools: objectSchema({ enabled: objectSchema({ webSearch: { type: 'boolean' }, readUrl: { type: 'boolean' } }), permissions: objectSchema({ webSearch: { enum: ['allow', 'ask', 'deny'] }, readUrl: { enum: ['allow', 'ask', 'deny'] } }), searchApiKey: { type: 'string', writeOnly: true } }) }, ['profile', 'messages'])],
    ['/api/media', 'generateMedia', 'Generate provider images or video. Can incur provider charges.', objectSchema({ ...credentials, model: text, mode: { enum: ['image_generation', 'video_generation'] }, prompt: text, generationParams: { type: 'object' }, attachments: { type: 'array', items: { type: 'object' } } }, ['baseUrl', 'apiKey', 'model', 'mode', 'prompt'])],
    ['/api/media/status', 'getMediaStatus', 'Poll a provider video request.', objectSchema({ ...credentials, model: text, requestId: text }, ['baseUrl', 'apiKey', 'model', 'requestId'])],
    ['/api/diagnostics', 'diagnoseProvider', 'Validate configuration and send a small potentially billable chat probe.', objectSchema({ ...credentials, model: text }, ['baseUrl', 'apiKey', 'model'])],
    ['/api/tools/search', 'searchWeb', 'Transmit a query to the configured search service. Requires user authorization.', objectSchema({ query: text, searchApiKey: { type: 'string', writeOnly: true } }, ['query'])],
    ['/api/tools/read-url', 'readPublicUrl', 'Transmit a public URL to the reader service. Requires user authorization.', objectSchema({ url: { type: 'string', format: 'uri' }, searchApiKey: { type: 'string', writeOnly: true } }, ['url'])],
  ]
  const paths = Object.fromEntries(routes.map(([path, operationId, summary, schema]) => [path, { post: {
    operationId, summary,
    requestBody: { required: true, content: { 'application/json': { schema } } },
    responses: {
      '200': { description: 'JSON result; shape depends on the operation and provider.', content: { 'application/json': { schema: { type: 'object' } } } },
      '400': { description: 'Invalid configuration, credentials or provider request.' },
      '413': { description: 'Request exceeds the body size limit.' },
      '429': { description: 'Rate limited. Honor Retry-After.' },
      '502': { description: 'Provider request failed.' },
      '503': { description: 'Request protection is temporarily unavailable.' },
    },
  } }]))
  return {
    openapi: '3.1.0', info: { title: 'BYOK Chat Worker API', version: '1.0.0', description: 'No site account or OAuth. User-owned provider keys travel in JSON bodies. Operational responses are not cached. Most bodies are limited to 1 MiB; chat and media accept up to 32 MiB. Provider usage can incur charges. /api/chat-json is an alias of /api/chat.' },
    servers: [{ url: origin }], security: [], paths,
    externalDocs: { url: `${origin}/auth.md` },
  }
}

export async function handleAgentDiscovery(request: Request): Promise<Response | null> {
  const { origin, pathname } = new URL(request.url)
  let body: string | undefined
  let contentType = 'text/markdown; charset=utf-8'
  const asJson = (value: unknown, type = 'application/json') => {
    contentType = `${type}; charset=utf-8`
    return JSON.stringify(value, null, 2) + '\n'
  }
  if ((pathname === '/' || pathname === '/index.html') && prefersMarkdown(request.headers.get('accept') || '')) body = agentGuide(origin)
  if (pathname === '/agent-guide.md') body = agentGuide(origin)
  if (pathname === '/auth.md') body = authMarkdown(origin)
  if (pathname === SKILL_PATH) body = skill(origin)
  if (pathname === '/llms.txt') body = `# BYOK Chat\n\n> Browser-local Bring Your Own Key chat workspace.\n\n## Documentation\n- [Setup and API guide](${origin}/agent-guide.md)\n- [Authentication](${origin}/auth.md)\n- [OpenAPI](${origin}/openapi.json)\n- [Privacy](${origin}/privacy)\n`
  if (pathname === '/robots.txt') {
    contentType = 'text/plain; charset=utf-8'
    body = `User-agent: *\nAllow: /\nDisallow: /api/\nContent-Signal: search=yes, ai-input=yes, ai-train=no\n\nSitemap: ${origin}/sitemap.xml\nAgentmap: ${origin}/.well-known/ai-catalog.json\n`
  }
  if (pathname === '/sitemap.xml') {
    contentType = 'application/xml; charset=utf-8'
    body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/privacy', '/terms', '/cookies'].map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}\n</urlset>\n`
  }
  if (pathname === '/openapi.json') body = asJson(openApi(origin))
  if (pathname === '/.well-known/api-catalog') body = asJson({ linkset: [{
    anchor: `${origin}/api/chat`,
    'service-desc': [{ href: `${origin}/openapi.json`, type: 'application/vnd.oai.openapi+json' }],
    'service-doc': [{ href: `${origin}/agent-guide.md`, type: 'text/markdown' }],
  }] }, 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"')
  if (pathname === '/.well-known/agent-skills/index.json') {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(skill(origin)))
    const hex = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
    body = asJson({ $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills: [{ name: 'use-byok-chat', type: 'skill-md', description: 'Connect a user-owned AI provider and use the BYOK Chat HTTP API safely.', url: `${origin}${SKILL_PATH}`, digest: `sha256:${hex}` }] })
  }
  if (pathname === '/.well-known/ai-catalog.json') body = asJson({
    specVersion: '1.0', host: { displayName: 'BYOK Chat', identifier: origin },
    entries: [{ identifier: `urn:air:${new URL(origin).hostname}:api:chat`, displayName: 'BYOK Chat Worker API', type: 'application/vnd.oai.openapi+json', url: `${origin}/openapi.json`, representativeQueries: ['Connect my own AI provider key to a chat workspace', 'Find BYOK Chat API request schemas'] }],
  })

  // SPA fallback must not impersonate unsupported discovery protocols.
  if (body === undefined) {
    if (!pathname.startsWith('/.well-known/')) return null
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ error: { message: 'Discovery resource not found' } }), {
      status: 404, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  return new Response(request.method === 'HEAD' ? null : body, { headers: {
    'content-type': contentType, 'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*',
  } })
}
