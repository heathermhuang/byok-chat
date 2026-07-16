import type { RunMetadata } from '../../lib/threads'
import { formatCost, formatLatency } from '../../lib/usage'

export function RunMetaBar({ metadata, compact = false }: { metadata: RunMetadata; compact?: boolean }) {
  return (
    <div className={`run-meta ${compact ? 'compact' : ''}`}>
      <span>{formatLatency(metadata.latencyMs)}</span>
      <span>{metadata.totalTokens ? `${metadata.totalTokens} tokens` : 'tokens n/a'}</span>
      <span title={metadata.estimatedCostSource || undefined}>{formatCost(metadata.estimatedCostUsd)}</span>
      <span>{metadata.statusCode || 200}</span>
    </div>
  )
}
