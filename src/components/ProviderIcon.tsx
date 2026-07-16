import type { ProviderId } from '../lib/providers'

type ProviderIconProps = {
  provider: ProviderId
  size?: number
}

export function ProviderIcon({ provider, size = 18 }: ProviderIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (provider === 'openrouter') {
    return <svg {...common}><path d="M3 7h11l3-3m-3 3 3 3M21 17H10l-3 3m3-3-3-3" /></svg>
  }
  if (provider === 'openai') {
    return <svg {...common}><path d="M12 3.3a4 4 0 0 1 3.8 2.7 4 4 0 0 1 3 6.7 4 4 0 0 1-3.8 5.8A4 4 0 0 1 8.2 18a4 4 0 0 1-3-6.7A4 4 0 0 1 9 5.5 4 4 0 0 1 12 3.3Z" /><path d="m8.5 9 3.5-2 3.5 2v4L12 15l-3.5-2V9Z" /></svg>
  }
  if (provider === 'claude') {
    return <svg {...common}><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" /></svg>
  }
  if (provider === 'minimax') {
    return <svg {...common}><path d="M4 18V7l4 6 4-6v11M14 7l6 11M20 7l-6 11" /></svg>
  }
  if (provider === 'zai') {
    return <svg {...common}><path d="M5 6h14L5 18h14" /><path d="M8 10h8" /></svg>
  }
  if (provider === 'deepseek') {
    return <svg {...common}><path d="M3 13c2.5 4.5 7 6.5 11.5 4.5 2.8-1.2 4.4-3.4 5.5-6.5-2.4 1.4-4.5 1.5-6.5.4C10.3 9.7 7 9.7 3 13Z" /><path d="M15.5 8.5c1.5-.4 2.6-1.4 3.3-3" /><circle cx="8" cy="13" r=".7" fill="currentColor" stroke="none" /></svg>
  }
  if (provider === 'gemini') {
    return <svg {...common}><path d="M12 2.8c.8 5.5 3.7 8.4 9.2 9.2-5.5.8-8.4 3.7-9.2 9.2-.8-5.5-3.7-8.4-9.2-9.2 5.5-.8 8.4-3.7 9.2-9.2Z" /></svg>
  }
  if (provider === 'xai') {
    return <svg {...common}><path d="m5 5 14 14M19 5 9 15M15 5h4v4" /></svg>
  }
  return <svg {...common}><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M8 12h8" /></svg>
}
