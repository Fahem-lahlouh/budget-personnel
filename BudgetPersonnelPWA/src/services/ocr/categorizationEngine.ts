import { brandKey, normalizeMerchantLabel } from './merchantNormalizer'
import type { ConfidenceLevel } from '@/models/import'
import type { CategorizationRule, MerchantAlias } from '@/models/import'
import type { Expense, ExpenseType, Merchant } from '@/models/types'

export interface CategorizationProposal {
  categoryId: string | null
  merchantId: string | null
  /** Nom à proposer pour une nouvelle enseigne quand aucune ne correspond. */
  suggestedMerchantName: string | null
  expenseType: ExpenseType | null
  merchantConfidence: ConfidenceLevel
  categoryConfidence: ConfidenceLevel
}

export interface CategorizationContext {
  rules: CategorizationRule[]
  aliases: MerchantAlias[]
  merchants: Merchant[]
  /** Historique du mois ou de l'année, pour déduire la catégorie la plus fréquente d'une enseigne. */
  expenses: Expense[]
}

/**
 * Propose une enseigne et une catégorie pour un libellé bancaire brut, sans
 * jamais appeler de service externe : uniquement la normalisation locale et
 * ce que l'utilisateur a déjà corrigé par le passé (voir `learnFromCorrection`
 * dans les repositories `merchantAliasRepository`/`categorizationRuleRepository`).
 *
 * Ordre de résolution, du plus sûr au plus incertain :
 * 1. Règle apprise exacte sur le libellé normalisé → catégorie + enseigne, confiance haute.
 * 2. Alias d'enseigne appris exact → enseigne connue, confiance haute ; catégorie
 *    déduite de la catégorie la plus fréquente des dépenses passées de cette enseigne.
 * 3. Rapprochement approximatif par « marque » (premier mot du libellé normalisé)
 *    avec une enseigne déjà existante → confiance moyenne.
 * 4. Rien de reconnu → confiance faible, aucune proposition : à l'utilisateur de choisir.
 */
export function proposeCategorization(rawLabel: string, ctx: CategorizationContext): CategorizationProposal {
  const normalized = normalizeMerchantLabel(rawLabel)

  const rule = ctx.rules.find((r) => r.normalizedPattern === normalized)
  if (rule) {
    return {
      categoryId: rule.categoryId,
      merchantId: rule.merchantId,
      suggestedMerchantName: null,
      expenseType: rule.expenseType,
      merchantConfidence: rule.merchantId ? 'haute' : 'faible',
      categoryConfidence: 'haute',
    }
  }

  const alias = ctx.aliases.find((a) => a.normalizedPattern === normalized)
  if (alias) {
    const category = mostFrequentCategory(ctx.expenses, alias.merchantId)
    return {
      categoryId: category,
      merchantId: alias.merchantId,
      suggestedMerchantName: null,
      expenseType: null,
      merchantConfidence: 'haute',
      categoryConfidence: category ? 'moyenne' : 'faible',
    }
  }

  const key = brandKey(normalized)
  if (key.length >= 3) {
    const fuzzyMerchant = ctx.merchants.find((m) => {
      const merchantNormalized = normalizeMerchantLabel(m.name)
      return merchantNormalized === key || brandKey(merchantNormalized) === key
    })
    if (fuzzyMerchant) {
      const category = mostFrequentCategory(ctx.expenses, fuzzyMerchant.id)
      return {
        categoryId: category,
        merchantId: fuzzyMerchant.id,
        suggestedMerchantName: null,
        expenseType: null,
        merchantConfidence: 'moyenne',
        categoryConfidence: category ? 'moyenne' : 'faible',
      }
    }
  }

  return {
    categoryId: null,
    merchantId: null,
    suggestedMerchantName: titleCase(normalized || rawLabel.trim()),
    expenseType: null,
    merchantConfidence: 'faible',
    categoryConfidence: 'faible',
  }
}

function mostFrequentCategory(expenses: Expense[], merchantId: string): string | null {
  const counts = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.merchantId !== merchantId) continue
    counts.set(expense.categoryId, (counts.get(expense.categoryId) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [categoryId, count] of counts) {
    if (count > bestCount) {
      best = categoryId
      bestCount = count
    }
  }
  return best
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}
