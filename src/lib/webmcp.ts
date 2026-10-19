import { agentGuide, publicProviders } from './agent-info.ts'

type PublicTool = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, never>; additionalProperties: false }
  annotations: { readOnlyHint: true; untrustedContentHint: false; consequentialHint: false }
  execute: () => Promise<unknown>
}

type ModelContext = {
  registerTool: (tool: PublicTool, options?: { signal: AbortSignal }) => void | Promise<void>
}

export async function registerPublicAgentTools(
  doc: Document = document,
  nav: Navigator = navigator,
): Promise<() => void> {
  const context = (doc as Document & { modelContext?: ModelContext }).modelContext
    ?? (nav as Navigator & { modelContext?: ModelContext }).modelContext
  if (!context?.registerTool) return () => {}
  const controller = new AbortController()
  const origin = doc.location.origin
  const tools: PublicTool[] = [
    {
      name: 'get_byok_guide',
      description: 'Read public BYOK Chat setup, authentication, privacy and API documentation. Does not access saved keys, profiles or conversations.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false, consequentialHint: false },
      execute: async () => agentGuide(origin),
    },
    {
      name: 'list_byok_providers',
      description: 'List public provider presets and supported endpoint capabilities. Does not read user configuration or contact providers.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false, consequentialHint: false },
      execute: async () => publicProviders(),
    },
  ]
  try {
    for (const tool of tools) await context.registerTool(tool, { signal: controller.signal })
  } catch {
    // An optional browser integration must never prevent the workspace loading.
    controller.abort()
  }
  return () => controller.abort()
}
