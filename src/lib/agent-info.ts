import { PROVIDER_PRESETS } from './providers.ts'

// Public product information only. Never read profiles, credentials or threads here.
export function publicProviders() {
  return PROVIDER_PRESETS.map(({ id, label, baseUrl, apiFormat, paths }) => ({
    id, name: label, baseUrl, apiFormat, capabilities: Object.keys(paths),
  }))
}

export function agentGuide(origin: string): string {
  return `# BYOK Chat · Bring Your Own Key

BYOK Chat is a browser-local chat workspace for AI provider accounts you control.
It does not sell model access or require a BYOK Chat account or subscription.

## Connect a provider

1. Open [the workspace](${origin}/) and choose a provider or a custom OpenAI-compatible endpoint.
2. Enter an API key from your own provider account. Custom endpoints require HTTPS and a public hostname.
3. Load the available models, or enter a model ID manually when the provider has no model listing.
4. Save and connect, then send a message. Chat, comparison, images and video depend on provider/model support.
5. Enable web search or public URL reading only when needed and explicitly allow the tool for the request.

## Credentials, privacy and costs

Profiles and chat history are saved in the current browser. Keys can be stored as
browser data or encrypted locally with a passphrase; the passphrase is not saved.
Active prompts, context, attachments and credentials pass through the Cloudflare
Worker in memory to the selected provider. There is no intentional server-side
chat archive. Providers can charge for model requests, media and diagnostic probes.
Search/reader services receive queries or public URLs when those tools are used.
Do not put credentials in URLs, logs, discovery metadata or shared transcripts.
Never read saved keys or conversations on behalf of an agent without the user's authorization.

## Machine-readable access

- [Authentication guide](${origin}/auth.md)
- [API catalog](${origin}/.well-known/api-catalog)
- [OpenAPI description](${origin}/openapi.json)
- [Agent skills](${origin}/.well-known/agent-skills/index.json)
- [Capability catalog](${origin}/.well-known/ai-catalog.json)

The homepage supports Accept: text/markdown. The same public guide is available
at /agent-guide.md. Supporting browsers expose get_byok_guide and
list_byok_providers as read-only WebMCP tools. They return public documentation
and provider presets only, without reading browser storage or calling a provider.
There is no OAuth authorization server, remote MCP server, A2A service, Poppy
identity service or agent payment protocol on this origin.

## Policies and source

- [Privacy](${origin}/privacy)
- [Terms](${origin}/terms)
- [Cookies](${origin}/cookies)
- [Source code](https://github.com/heathermhuang/byok-chat)
`
}
