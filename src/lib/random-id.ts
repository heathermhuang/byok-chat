function formatId(prefix: string | undefined, value: string): string {
  return prefix ? `${prefix}-${value}` : value
}

export function secureRandomId(prefix?: string): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return formatId(prefix, cryptoApi.randomUUID())
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random number generation is unavailable in this browser.')
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return formatId(prefix, value)
}
