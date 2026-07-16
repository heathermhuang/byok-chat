export type ToolId = 'webSearch' | 'readUrl'

export type ToolPermission = 'allow' | 'ask' | 'deny'

export type ToolDefinition = {
  id: ToolId
  label: string
  description: string
  needsInput: 'prompt' | 'url-in-prompt'
  defaultPermission: ToolPermission
}

export type ToolDefaults = Partial<Record<ToolId, boolean>> & {
  permissions?: Partial<Record<ToolId, ToolPermission>>
  memory?: boolean
}

export type ToolSettings = {
  enabled: Record<ToolId, boolean>
  permissions: Record<ToolId, ToolPermission>
  memory: boolean
  searchApiKey?: string
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: 'webSearch',
    label: 'Web search',
    description: 'Search public web results and attach source records to the next chat turn.',
    needsInput: 'prompt',
    defaultPermission: 'deny',
  },
  {
    id: 'readUrl',
    label: 'URL read',
    description: 'Read public URLs that are explicitly present in the next prompt.',
    needsInput: 'url-in-prompt',
    defaultPermission: 'deny',
  },
]

const TOOL_IDS = TOOL_REGISTRY.map((tool) => tool.id)

function normalizePermission(value: unknown, fallback: ToolPermission): ToolPermission {
  return value === 'allow' || value === 'ask' || value === 'deny' ? value : fallback
}

export function normalizeToolDefaults(defaults: ToolDefaults | undefined): ToolDefaults {
  const raw = defaults && typeof defaults === 'object' ? defaults : {}
  const permissions = TOOL_IDS.reduce((next, id) => {
    next[id] = normalizePermission(raw.permissions?.[id], TOOL_REGISTRY.find((tool) => tool.id === id)?.defaultPermission || 'ask')
    return next
  }, {} as Record<ToolId, ToolPermission>)

  return {
    webSearch: Boolean(raw.webSearch),
    readUrl: Boolean(raw.readUrl),
    memory: raw.memory !== false,
    permissions,
  }
}

export function createToolSettings(defaults: ToolDefaults | undefined, searchApiKey?: string): ToolSettings {
  const normalized = normalizeToolDefaults(defaults)
  return {
    enabled: {
      webSearch: Boolean(normalized.webSearch),
      readUrl: Boolean(normalized.readUrl),
    },
    permissions: {
      webSearch: normalizePermission(normalized.permissions?.webSearch, 'deny'),
      readUrl: normalizePermission(normalized.permissions?.readUrl, 'deny'),
    },
    memory: normalized.memory !== false,
    searchApiKey,
  }
}

export function isToolAllowed(settings: Pick<ToolSettings, 'enabled' | 'permissions'>, toolId: ToolId): boolean {
  return Boolean(settings.enabled[toolId] && settings.permissions[toolId] === 'allow')
}

export function updateToolDefault(defaults: ToolDefaults | undefined, toolId: ToolId, patch: { enabled?: boolean; permission?: ToolPermission }): ToolDefaults {
  const normalized = normalizeToolDefaults(defaults)
  return {
    ...normalized,
    [toolId]: patch.enabled ?? Boolean(normalized[toolId]),
    permissions: {
      ...normalized.permissions,
      [toolId]: patch.permission || normalized.permissions?.[toolId] || 'deny',
    },
  }
}
