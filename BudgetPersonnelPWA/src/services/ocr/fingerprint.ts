import { normalizeMerchantLabel } from './merchantNormalizer'

/**
 * Empreinte de déduplication : `date|montant|enseigne normalisée`. Deux
 * opérations qui partagent cette empreinte sont considérées comme la même
 * transaction, qu'elle vienne d'un import précédent ou d'une saisie manuelle.
 */
export function computeFingerprint(date: string, amount: number, label: string): string {
  return `${date}|${amount.toFixed(2)}|${normalizeMerchantLabel(label)}`
}
