export type EncryptedSecret = {
  version: 1
  algorithm: 'AES-GCM'
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
  createdAt: string
}

const DEFAULT_ITERATIONS = 150_000

function webCrypto(): Crypto | undefined {
  return globalThis.crypto?.subtle ? globalThis.crypto : undefined
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function deriveKey(cryptoImpl: Crypto, passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await cryptoImpl.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return cryptoImpl.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: bufferSource(salt),
      iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function canUseEncryptedStorage(): boolean {
  return Boolean(webCrypto())
}

export async function encryptSecret(
  secret: string,
  passphrase: string,
  options: { iterations?: number; cryptoImpl?: Crypto } = {},
): Promise<EncryptedSecret> {
  const cryptoImpl = options.cryptoImpl || webCrypto()
  if (!cryptoImpl?.subtle) throw new Error('Web Crypto is not available in this browser.')
  if (!secret.trim()) throw new Error('Enter an API key before saving an encrypted profile.')
  if (!passphrase.trim()) throw new Error('Enter a passphrase to encrypt this key.')

  const salt = cryptoImpl.getRandomValues(new Uint8Array(16))
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12))
  const iterations = options.iterations || DEFAULT_ITERATIONS
  const key = await deriveKey(cryptoImpl, passphrase, salt, iterations)
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: 'AES-GCM', iv: bufferSource(iv) },
    key,
    new TextEncoder().encode(secret),
  )

  return {
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  }
}

export async function decryptSecret(
  encrypted: EncryptedSecret,
  passphrase: string,
  options: { cryptoImpl?: Crypto } = {},
): Promise<string> {
  const cryptoImpl = options.cryptoImpl || webCrypto()
  if (!cryptoImpl?.subtle) throw new Error('Web Crypto is not available in this browser.')
  if (!passphrase.trim()) throw new Error('Enter the passphrase for this key.')
  if (encrypted.version !== 1 || encrypted.algorithm !== 'AES-GCM' || encrypted.kdf !== 'PBKDF2-SHA-256') {
    throw new Error('This encrypted key format is not supported.')
  }

  try {
    const key = await deriveKey(cryptoImpl, passphrase, base64ToBytes(encrypted.salt), encrypted.iterations)
    const iv = base64ToBytes(encrypted.iv)
    const ciphertext = base64ToBytes(encrypted.ciphertext)
    const plaintext = await cryptoImpl.subtle.decrypt(
      { name: 'AES-GCM', iv: bufferSource(iv) },
      key,
      bufferSource(ciphertext),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error('Passphrase did not unlock this key.')
  }
}
