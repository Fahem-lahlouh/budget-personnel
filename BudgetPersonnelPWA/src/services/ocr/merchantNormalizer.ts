/**
 * Normalisation des libellés d'opérations bancaires.
 *
 * Un même commerçant apparaît sous des formes différentes selon la banque et
 * le mode de paiement : « AUCHAN SUPERMARCHE 057 », « CB AUCHAN PARIS »,
 * « ACHAT CB AUCHAN 15/09 ». La normalisation retire les mentions de moyen de
 * paiement, les codes d'agence/magasin et la ponctuation, pour obtenir une clé
 * stable utilisée à la fois pour l'empreinte anti-doublon et pour
 * l'apprentissage des règles de catégorisation.
 */

const PAYMENT_PREFIXES = [
  'PAIEMENT PAR CARTE',
  'ACHAT CARTE',
  'PAIEMENT CB',
  'ACHAT CB',
  'CARTE CB',
  'CB',
  'CARTE',
  'PRELEVEMENT',
  'PRELEVMENT',
  'PRLV',
  'VIREMENT',
  'VIR',
  'RETRAIT',
]

/** Retire les diacritiques (« é » → « e ») pour une comparaison stable. */
function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Normalise un libellé d'opération en une clé de comparaison stable :
 * majuscules, sans accents, sans mention de moyen de paiement, sans dates ni
 * codes numériques de magasin/agence, espaces réduits.
 */
export function normalizeMerchantLabel(raw: string): string {
  let value = stripDiacritics(raw.trim().toUpperCase())

  // Dates éventuellement mêlées au libellé (ex. « ACHAT CB 15/09 AUCHAN »).
  value = value.replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, ' ')

  // Mentions de moyen de paiement, en préfixe le plus souvent.
  for (const prefix of PAYMENT_PREFIXES) {
    value = value.replace(new RegExp(`\\b${prefix}\\b`, 'g'), ' ')
  }

  // Ponctuation courante des relevés (astérisques, dièses, tirets isolés…).
  value = value.replace(/[*#_/\\.,;:()]/g, ' ')

  // Codes numériques purs (magasin, agence, référence) : jamais de sens sémantique.
  value = value.replace(/\b\d{2,}\b/g, ' ')

  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Premier mot significatif d'un libellé normalisé — la « marque » présumée.
 * Sert à proposer un rapprochement avec une enseigne déjà connue quand aucune
 * règle apprise n'existe encore pour ce libellé exact.
 */
export function brandKey(normalized: string): string {
  const [first = ''] = normalized.split(' ')
  return first
}
