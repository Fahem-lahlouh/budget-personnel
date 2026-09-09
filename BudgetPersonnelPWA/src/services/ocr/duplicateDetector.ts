import { computeFingerprint } from './fingerprint'
import type { Expense } from '@/models/types'

/**
 * Empreintes des dépenses déjà enregistrées, pour repérer un import qui
 * réintroduirait une opération saisie manuellement ou lors d'un import
 * précédent. L'enseigne de la dépense sert de libellé quand elle existe ; à
 * défaut, sa description.
 */
export function buildExistingFingerprints(
  expenses: Expense[],
  merchantName: (id: string) => string | undefined,
): Set<string> {
  const set = new Set<string>()
  for (const expense of expenses) {
    const label = (expense.merchantId && merchantName(expense.merchantId)) || expense.description
    if (!label) continue
    set.add(computeFingerprint(expense.date, expense.amount, label))
  }
  return set
}

/** Une empreinte déjà vue — import précédent ou dépense existante — signale un doublon probable. */
export function isDuplicateFingerprint(fingerprint: string, knownFingerprints: Set<string>): boolean {
  return knownFingerprints.has(fingerprint)
}
