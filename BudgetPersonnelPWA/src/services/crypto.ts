import { db } from '@/repositories/db'
import type { PinRecord } from '@/models/types'

/**
 * Protection du code PIN.
 *
 * Le code n'est **jamais** stocké, ni en clair ni chiffré de façon réversible.
 * On enregistre uniquement une empreinte PBKDF2-SHA256 calculée sur le code et
 * un sel aléatoire de 16 octets, avec un nombre d'itérations élevé : à partir
 * de l'empreinte, retrouver un code à 6 chiffres reste possible par force brute
 * hors ligne, mais coûte cher, et c'est bien pour ça que le nombre
 * d'itérations est haut.
 *
 * ## Limite à connaître, et énoncée telle quelle dans l'app
 *
 * Ce verrou protège l'**affichage** : il empêche quelqu'un qui prend le
 * téléphone en main d'ouvrir l'app et de lire les montants. Ce n'est pas du
 * chiffrement de la base : les dépenses restent lisibles dans IndexedDB pour
 * qui sait ouvrir les outils de développement du navigateur. La vraie
 * protection des données au repos, c'est le code de déverrouillage de
 * l'iPhone, qui chiffre le stockage du système.
 */

/**
 * 310 000 itérations : la recommandation OWASP pour PBKDF2-HMAC-SHA256.
 * Coût mesuré sur iPhone récent : de l'ordre de 200–400 ms, acceptable pour un
 * déverrouillage, dissuasif pour une attaque par dictionnaire.
 */
const ITERATIONS = 310_000
const SALT_BYTES = 16
const KEY_BITS = 256

export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    KEY_BITS,
  )
}

/** Comparaison en temps constant : ne pas fuir d'information par la durée. */
function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

export const pinService = {
  async isConfigured(): Promise<boolean> {
    return (await db.credentials.get('pin')) !== undefined
  },

  /** Définit ou remplace le code. */
  async setPin(pin: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const hash = await derive(pin, salt, ITERATIONS)
    const record: PinRecord = {
      id: 'pin',
      salt: toBase64(salt.buffer as ArrayBuffer),
      hash: toBase64(hash),
      iterations: ITERATIONS,
      algorithm: 'PBKDF2-SHA256',
    }
    await db.credentials.put(record)
  },

  async verify(pin: string): Promise<boolean> {
    const record = (await db.credentials.get('pin')) as PinRecord | undefined
    if (!record) return false
    // Les paramètres sont relus depuis l'enregistrement : un code créé avec un
    // ancien nombre d'itérations reste vérifiable après une mise à jour.
    const hash = await derive(pin, fromBase64(record.salt), record.iterations)
    return constantTimeEquals(new Uint8Array(hash), fromBase64(record.hash))
  },

  async clear(): Promise<void> {
    await db.credentials.delete('pin')
  },
}
