import { db } from '@/repositories/db'
import type { WebAuthnRecord } from '@/models/types'
import { fromBase64, toBase64 } from './crypto'

/**
 * Déverrouillage biométrique (Face ID / Touch ID) via WebAuthn.
 *
 * ## Ce qui se passe réellement — rien n'est simulé
 *
 * À l'activation, on demande au système de créer une paire de clés protégée
 * par l'authentificateur de l'appareil (`platform` + `userVerification:
 * required`). iOS n'y donne accès qu'après un Face ID / Touch ID réussi. On
 * conserve la **clé publique**.
 *
 * Au déverrouillage, on tire un défi aléatoire, on demande une signature, puis
 * on **vérifie réellement cette signature** avec la clé publique via Web
 * Crypto. Il n'y a pas de « si l'appel réussit alors c'est bon » : une
 * signature invalide est rejetée.
 *
 * ## Limite honnête
 *
 * La vérification a lieu dans la page elle-même, pas sur un serveur. Quelqu'un
 * qui ouvre les outils de développement peut contourner le verrou — comme il
 * peut lire IndexedDB directement. Ce mécanisme protège contre un accès
 * opportuniste au téléphone, pas contre un attaquant technique déterminé qui
 * aurait déjà l'appareil déverrouillé entre les mains.
 *
 * WebAuthn exige HTTPS (ou localhost) et un domaine stable : sur GitHub Pages,
 * l'identifiant de partie de confiance est le domaine `*.github.io`.
 */

/** Le navigateur expose-t-il WebAuthn ? */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.create === 'function'
  )
}

/** Un authentificateur intégré (Face ID / Touch ID) est-il disponible ? */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

function randomChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

export const webauthnService = {
  async isEnrolled(): Promise<boolean> {
    return (await db.credentials.get('webauthn')) !== undefined
  },

  /**
   * Enrôle l'appareil. Renvoie `false` si l'utilisateur annule ou si la clé
   * publique ne peut pas être extraite dans un format exploitable.
   */
  async enroll(): Promise<boolean> {
    if (!isWebAuthnSupported()) return false

    const userId = crypto.getRandomValues(new Uint8Array(16))
    try {
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge() as BufferSource,
          rp: { name: 'Budget Personnel' },
          user: {
            id: userId as BufferSource,
            name: 'budget-personnel-local',
            displayName: 'Budget Personnel',
          },
          // ES256 puis RS256 : les deux algorithmes que tout authentificateur
          // sait produire.
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60_000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null

      if (!credential) return false
      const response = credential.response as AuthenticatorAttestationResponse

      // `getPublicKey()` renvoie directement du SPKI : cela évite d'embarquer
      // un décodeur CBOR pour lire l'objet d'attestation.
      const spki = response.getPublicKey?.()
      const algorithm = response.getPublicKeyAlgorithm?.()
      if (!spki || algorithm === undefined) return false

      const record: WebAuthnRecord = {
        id: 'webauthn',
        credentialId: toBase64(credential.rawId),
        publicKey: toBase64(spki),
        algorithm,
        createdAt: new Date().toISOString(),
      }
      await db.credentials.put(record)
      return true
    } catch {
      return false
    }
  },

  /** Demande une signature et la vérifie réellement. */
  async authenticate(): Promise<boolean> {
    if (!isWebAuthnSupported()) return false
    const record = (await db.credentials.get('webauthn')) as WebAuthnRecord | undefined
    if (!record) return false

    const challenge = randomChallenge()

    try {
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: challenge as BufferSource,
          allowCredentials: [
            {
              type: 'public-key',
              id: fromBase64(record.credentialId) as BufferSource,
              transports: ['internal'],
            },
          ],
          userVerification: 'required',
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null

      if (!assertion) return false
      const response = assertion.response as AuthenticatorAssertionResponse

      const clientData = JSON.parse(new TextDecoder().decode(response.clientDataJSON)) as {
        type: string
        challenge: string
      }
      // Le défi renvoyé doit être exactement celui qu'on vient de tirer :
      // c'est ce qui empêche de rejouer une ancienne signature.
      if (clientData.type !== 'webauthn.get') return false
      if (clientData.challenge !== base64Url(challenge)) return false

      const key = await importKey(record)
      if (!key) return false

      const clientDataHash = await crypto.subtle.digest('SHA-256', response.clientDataJSON)
      const signedData = concat(new Uint8Array(response.authenticatorData), new Uint8Array(clientDataHash))
      const signature =
        record.algorithm === -7
          ? derToRawEcdsa(new Uint8Array(response.signature))
          : new Uint8Array(response.signature)
      if (!signature) return false

      const verifyAlgorithm =
        record.algorithm === -7
          ? { name: 'ECDSA', hash: 'SHA-256' }
          : { name: 'RSASSA-PKCS1-v1_5' }

      return await crypto.subtle.verify(
        verifyAlgorithm,
        key,
        signature as BufferSource,
        signedData as BufferSource,
      )
    } catch {
      return false
    }
  },

  async clear(): Promise<void> {
    await db.credentials.delete('webauthn')
  },
}

async function importKey(record: WebAuthnRecord): Promise<CryptoKey | null> {
  const spki = fromBase64(record.publicKey)
  try {
    if (record.algorithm === -7) {
      return await crypto.subtle.importKey(
        'spki',
        spki as BufferSource,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      )
    }
    if (record.algorithm === -257) {
      return await crypto.subtle.importKey(
        'spki',
        spki as BufferSource,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      )
    }
    return null
  } catch {
    return null
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/** Encodage base64url sans remplissage, tel que WebAuthn le produit. */
function base64Url(bytes: Uint8Array): string {
  return toBase64(bytes.buffer as ArrayBuffer)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Convertit une signature ECDSA DER (ASN.1) en paire brute `r || s`.
 *
 * Les authentificateurs signent en DER, alors que Web Crypto attend 64 octets
 * bruts pour P-256 : sans cette conversion, toute vérification échouerait.
 */
function derToRawEcdsa(der: Uint8Array): Uint8Array | null {
  if (der[0] !== 0x30) return null
  let offset = 2
  // Longueur sur deux octets quand le premier vaut 0x81.
  if (der[1] & 0x80) offset += der[1] & 0x7f

  const readInteger = (): Uint8Array | null => {
    if (der[offset] !== 0x02) return null
    offset += 1
    const length = der[offset]
    offset += 1
    const value = der.slice(offset, offset + length)
    offset += length
    return value
  }

  const r = readInteger()
  const s = readInteger()
  if (!r || !s) return null

  const out = new Uint8Array(64)
  // Les entiers DER portent parfois un 0x00 de tête (signe) et sont de
  // longueur variable : on les recadre à droite sur 32 octets.
  out.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length))
  out.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length))
  return out
}
