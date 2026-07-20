import type { RunMetadata } from '../../lib/threads'
import { formatCost, formatLatency } from '../../lib/usage'

export function RunMetaBar({ metadata, compact = false }: { metadata: RunMetadata; compact?: boolean }) {
  const items = [
    metadata.latencyMs && metadata.latencyMs > 0 ? { label: formatLatency(metadata.latencyMs) } : undefined,
    metadata.totalTokens && metadata.totalTokens > 0 ? { label: `${metadata.totalTokens} tokens` } : undefined,
    typeof metadata.estimatedCostUsd === 'number' && Number.isFinite(metadata.estimatedCostUsd)
      ? { label: formatCost(metadata.estimatedCostUsd), title: metadata.estimatedCostSource }
      : undefined,
    metadata.statusCode && metadata.statusCode > 0 ? { label: `HTTP ${metadata.statusCode}` } : undefined,
  ].filter((item): item is { label: string; title?: string } => Boolean(item))

  if (!items.length) return null

  return (
    <div className={`run-meta ${compact ? 'compact' : ''}`}>
      {items.map((item) => <span key={item.label} title={item.title}>{item.label}</span>)}
    </div>
  )
}
