export type UsageEstimate = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  estimatedCostSource?: string
}

type Price = {
  inputPerMillion: number
  outputPerMillion: number
  label: string
}

const MODEL_PRICING: Record<string, Price> = {
  'gpt-4o': { inputPerMillion: 5, outputPerMillion: 15, label: 'known static price' },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6, label: 'known static price' },
  'openai/gpt-4o': { inputPerMillion: 5, outputPerMillion: 15, label: 'known static price' },
  'openai/gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6, label: 'known static price' },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15, label: 'known static price' },
  'deepseek-chat': { inputPerMillion: 0.27, outputPerMillion: 1.1, label: 'known static price' },
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5, label: 'known static price' },
  'grok-4': { inputPerMillion: 3, outputPerMillion: 15, label: 'known static price' },
}

function normalizeModel(model: string): string {
  return model.trim().toLowerCase()
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.ceil(trimmed.length / 4))
}

export function estimateUsageCost<T extends UsageEstimate>(model: string, usage: T): T {
  const price = MODEL_PRICING[normalizeModel(model)]
  if (!price) return usage
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  return {
    ...usage,
    estimatedCostUsd: ((inputTokens / 1_000_000) * price.inputPerMillion) + ((outputTokens / 1_000_000) * price.outputPerMillion),
    estimatedCostSource: price.label,
  }
}

export function formatCost(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  if (value < 0.0001) return '<$0.0001'
  return `$${value.toFixed(4)}`
}

export function formatLatency(ms: number | undefined): string {
  if (!ms) return 'n/a'
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}
