import type {
  Expense,
  ExpenseType,
  MonthBudget,
  PaymentStatus,
  RecurringExpense,
} from '@/models/types'
import { OTHERS_ID, dueDateOf, makeMonthKey } from '@/models/types'

/**
 * Moteur de calcul du budget.
 *
 * Portage direct du `BudgetEngine` Swift : **uniquement des fonctions pures**.
 * Mêmes entrées, mêmes sorties, aucun accès à la base ni au DOM — ce qui les
 * rend testables sans navigateur et empêche un composant d'y glisser un effet
 * de bord. Les composants affichent ces résultats, ils ne les recalculent pas.
 */

export interface NamedTotal {
  id: string
  name: string
  amount: number
  /** Part du total, entre 0 et 1. */
  share: number
}

export interface MonthSummary {
  year: number
  month: number
  monthKey: string
  salary: number
  savingsGoal: number
  /** Total réellement dépensé sur le mois. */
  total: number
  count: number
  byCategory: NamedTotal[]
  byMerchant: NamedTotal[]
  byType: Record<ExpenseType, number>
  byStatus: Record<PaymentStatus, number>
  unpaidCount: number
  /** Somme des montants prévus des récurrentes pas encore saisies. */
  expectedRemaining: number
  /** Reste disponible = salaire − dépenses. Négatif en cas de dépassement. */
  remaining: number
  /**
   * Épargne réelle. Un dépassement ne compte pas comme une épargne négative :
   * c'est zéro (règle reprise du classeur Excel).
   */
  realSavings: number
  /** Part du salaire consommée. `0` si le salaire n'est pas renseigné. */
  consumption: number
  /** Dépenses projetées en fin de mois (réel + récurrentes attendues). */
  forecastTotal: number
  forecastRemaining: number
  /** Progression vers l'objectif d'épargne, bornée à 1. */
  savingsProgress: number
  isOverBudget: boolean
}

export interface YearSummary {
  year: number
  months: MonthSummary[]
  salary: number
  total: number
  count: number
  remaining: number
  realSavings: number
  consumption: number
  /** Moyenne calculée sur les seuls mois renseignés. */
  monthlyAverage: number
  busiestMonth: MonthSummary | null
  /** Mois où il est resté le plus d'argent. */
  bestMonth: MonthSummary | null
  byCategory: NamedTotal[]
  byMerchant: NamedTotal[]
  byType: Record<ExpenseType, number>
  byStatus: Record<PaymentStatus, number>
}

export interface RecurringStatus {
  recurring: RecurringExpense
  /** Dépense correspondante déjà saisie ce mois-ci, s'il y en a une. */
  matched: Expense | null
  dueDate: string
  /** Rien n'a été saisi pour cette récurrente ce mois-ci. */
  isMissing: boolean
  /** Saisie, mais toujours marquée « à payer ». */
  isPending: boolean
  /** À traiter : absente ou non réglée. */
  needsAttention: boolean
}

const EMPTY_TYPES: Record<ExpenseType, number> = { fixe: 0, variable: 0, exceptionnelle: 0 }
const EMPTY_STATUS: Record<PaymentStatus, number> = { paye: 0, aPayer: 0 }

/** Résout un identifiant en libellé lisible pour les agrégats. */
export type NameResolver = (id: string) => string | undefined

// MARK: - Synthèse mensuelle

export function summarizeMonth(params: {
  expenses: Expense[]
  recurring: RecurringExpense[]
  budget: MonthBudget | null | undefined
  year: number
  month: number
  categoryName?: NameResolver
  merchantName?: NameResolver
}): MonthSummary {
  const { expenses, recurring, budget, year, month, categoryName, merchantName } = params
  const monthKey = makeMonthKey(year, month)
  const monthly = expenses.filter((e) => e.monthKey === monthKey)

  let total = 0
  let unpaidCount = 0
  const categoryTotals = new Map<string, number>()
  const merchantTotals = new Map<string, number>()
  const byType = { ...EMPTY_TYPES }
  const byStatus = { ...EMPTY_STATUS }

  for (const expense of monthly) {
    total += expense.amount
    categoryTotals.set(
      expense.categoryId,
      (categoryTotals.get(expense.categoryId) ?? 0) + expense.amount,
    )
    // Une dépense sans enseigne n'entre pas dans le classement : elle
    // fausserait le « là où je dépense le plus ».
    if (expense.merchantId) {
      merchantTotals.set(
        expense.merchantId,
        (merchantTotals.get(expense.merchantId) ?? 0) + expense.amount,
      )
    }
    byType[expense.type] += expense.amount
    byStatus[expense.status] += expense.amount
    if (expense.status === 'aPayer') unpaidCount += 1
  }

  const statuses = recurringStatuses({ expenses: monthly, recurring, year, month })
  const expectedRemaining = statuses
    .filter((s) => s.isMissing)
    .reduce((sum, s) => sum + s.recurring.plannedAmount, 0)

  const salary = budget?.salary ?? 0
  const savingsGoal = budget?.savingsGoal ?? 0
  const remaining = salary - total
  const realSavings = Math.max(0, remaining)
  const forecastTotal = total + expectedRemaining

  return {
    year,
    month,
    monthKey,
    salary,
    savingsGoal,
    total,
    count: monthly.length,
    byCategory: rank(categoryTotals, total, categoryName),
    byMerchant: rank(merchantTotals, total, merchantName),
    byType,
    byStatus,
    unpaidCount,
    expectedRemaining,
    remaining,
    realSavings,
    consumption: salary > 0 ? total / salary : 0,
    forecastTotal,
    forecastRemaining: salary - forecastTotal,
    savingsProgress: savingsGoal > 0 ? Math.min(1, realSavings / savingsGoal) : 0,
    isOverBudget: salary > 0 && total > salary,
  }
}

// MARK: - Synthèse annuelle

export function summarizeYear(params: {
  expenses: Expense[]
  recurring: RecurringExpense[]
  budgets: MonthBudget[]
  year: number
  categoryName?: NameResolver
  merchantName?: NameResolver
}): YearSummary {
  const { expenses, recurring, budgets, year, categoryName, merchantName } = params
  const budgetsByMonth = new Map(budgets.filter((b) => b.year === year).map((b) => [b.month, b]))

  const months = Array.from({ length: 12 }, (_, index) =>
    summarizeMonth({
      expenses,
      recurring,
      budget: budgetsByMonth.get(index + 1),
      year,
      month: index + 1,
      categoryName,
      merchantName,
    }),
  )

  const salary = sum(months, (m) => m.salary)
  const total = sum(months, (m) => m.total)
  const active = months.filter((m) => m.total > 0)
  const remaining = salary - total

  const withSalary = months.filter((m) => m.salary > 0)
  const bestMonth =
    withSalary.length > 0
      ? withSalary.reduce((best, m) => (m.remaining > best.remaining ? m : best))
      : null

  return {
    year,
    months,
    salary,
    total,
    count: sum(months, (m) => m.count),
    remaining,
    realSavings: Math.max(0, remaining),
    consumption: salary > 0 ? total / salary : 0,
    monthlyAverage: active.length > 0 ? sum(active, (m) => m.total) / active.length : 0,
    busiestMonth: active.length > 0 ? active.reduce((a, b) => (b.total > a.total ? b : a)) : null,
    bestMonth,
    byCategory: mergeTotals(months.flatMap((m) => m.byCategory)),
    byMerchant: mergeTotals(months.flatMap((m) => m.byMerchant)),
    byType: months.reduce(
      (acc, m) => {
        acc.fixe += m.byType.fixe
        acc.variable += m.byType.variable
        acc.exceptionnelle += m.byType.exceptionnelle
        return acc
      },
      { ...EMPTY_TYPES },
    ),
    byStatus: months.reduce(
      (acc, m) => {
        acc.paye += m.byStatus.paye
        acc.aPayer += m.byStatus.aPayer
        return acc
      },
      { ...EMPTY_STATUS },
    ),
  }
}

// MARK: - Récurrentes

export function recurringStatuses(params: {
  expenses: Expense[]
  recurring: RecurringExpense[]
  year: number
  month: number
}): RecurringStatus[] {
  const { expenses, recurring, year, month } = params
  const monthKey = makeMonthKey(year, month)
  const monthly = expenses.filter((e) => e.monthKey === monthKey)

  return recurring
    .filter((item) => item.active)
    .slice()
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.sortOrder - b.sortOrder)
    .map((item) => {
      // Rattachement explicite d'abord, puis repli sur le libellé — c'est ce
      // que faisait le RECHERCHEV du classeur d'origine.
      const matched =
        monthly.find((e) => e.recurringId === item.id) ??
        monthly.find((e) => looseEquals(e.description, item.description)) ??
        null
      const isMissing = matched === null
      const isPending = matched?.status === 'aPayer'
      return {
        recurring: item,
        matched,
        dueDate: dueDateOf(item, year, month),
        isMissing,
        isPending,
        needsAttention: isMissing || isPending,
      }
    })
}

/** Montant prévu applicable à une description, d'après les récurrentes. */
export function plannedAmountFor(
  description: string,
  recurring: RecurringExpense[],
): number | null {
  const needle = description.trim()
  if (!needle) return null
  const match = recurring.find((item) => item.active && looseEquals(item.description, needle))
  return match ? match.plannedAmount : null
}

/**
 * Écart = montant réel − montant prévu. Positif ⇒ dépassement.
 *
 * Renvoie `null` quand il n'y a pas de budget associé, mais aussi quand
 * l'écart est nul : afficher « 0,00 € » sur une dépense pile dans le budget
 * n'apprend rien, l'absence de badge le dit déjà.
 */
export function varianceOf(expense: Pick<Expense, 'amount' | 'plannedAmount'>): number | null {
  if (expense.plannedAmount === null || expense.plannedAmount === 0) return null
  const variance = expense.amount - expense.plannedAmount
  return variance === 0 ? null : variance
}

// MARK: - Détail par catégorie / enseigne

export interface EntityDetailSummary {
  /** Somme des montants prévus renseignés (`null` exclus). */
  plannedTotal: number
  /** Somme des dépenses déjà réglées. */
  paidTotal: number
  /** Somme des dépenses encore à payer. */
  remainingToPay: number
  /** Dépensé réel, réglé ou non : `paidTotal + remainingToPay` par construction. */
  actualTotal: number
  count: number
}

const EMPTY_DETAIL: EntityDetailSummary = {
  plannedTotal: 0,
  paidTotal: 0,
  remainingToPay: 0,
  actualTotal: 0,
  count: 0,
}

/**
 * Détail d'une catégorie sur un ensemble de dépenses (typiquement déjà borné
 * à un mois). Fonction pure, appelée depuis l'écran de filtre par catégorie —
 * jamais recalculée à la main dans un composant.
 */
export function categoryDetailSummary(expenses: Expense[], categoryId: string): EntityDetailSummary {
  return detailSummary(expenses.filter((e) => e.categoryId === categoryId))
}

/** Équivalent de `categoryDetailSummary` pour une enseigne. */
export function merchantDetailSummary(expenses: Expense[], merchantId: string): EntityDetailSummary {
  return detailSummary(expenses.filter((e) => e.merchantId === merchantId))
}

function detailSummary(rows: Expense[]): EntityDetailSummary {
  if (rows.length === 0) return EMPTY_DETAIL

  let plannedTotal = 0
  let paidTotal = 0
  let remainingToPay = 0

  for (const expense of rows) {
    if (expense.plannedAmount !== null) plannedTotal += expense.plannedAmount
    if (expense.status === 'paye') paidTotal += expense.amount
    else remainingToPay += expense.amount
  }

  return {
    plannedTotal,
    paidTotal,
    remainingToPay,
    actualTotal: paidTotal + remainingToPay,
    count: rows.length,
  }
}

// MARK: - Regroupements

/** Top N + regroupement du reste sous « Autres », pour le donut. */
export function topWithOthers(totals: NamedTotal[], limit = 5): NamedTotal[] {
  if (totals.length <= limit) return totals
  const head = totals.slice(0, limit)
  const tail = totals.slice(limit)
  const amount = sum(tail, (t) => t.amount)
  if (amount <= 0) return head

  // Le jeu de catégories par défaut contient déjà une catégorie « Autres ».
  // Sans ce garde-fou, la légende afficherait deux entrées du même nom, l'une
  // étant une vraie catégorie et l'autre le cumul du reste.
  const collides = head.some((slice) => slice.name === 'Autres')

  return [
    ...head,
    {
      id: OTHERS_ID,
      name: collides ? 'Autres catégories' : 'Autres',
      amount,
      share: sum(tail, (t) => t.share),
    },
  ]
}

/** Trie un dictionnaire de totaux et calcule les parts. */
function rank(
  totals: Map<string, number>,
  total: number,
  resolveName?: NameResolver,
): NamedTotal[] {
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({
      id,
      name: resolveName?.(id) ?? id,
      amount,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) =>
      // Tri par montant puis par nom : deux montants égaux ne doivent pas
      // changer d'ordre d'un rendu à l'autre.
      a.amount === b.amount ? a.name.localeCompare(b.name, 'fr') : b.amount - a.amount,
    )
}

/** Fusionne plusieurs listes de totaux (utilisé par la vue annuelle). */
function mergeTotals(items: NamedTotal[]): NamedTotal[] {
  const merged = new Map<string, { name: string; amount: number }>()
  for (const item of items) {
    const current = merged.get(item.id)
    merged.set(item.id, {
      name: item.name,
      amount: (current?.amount ?? 0) + item.amount,
    })
  }
  const total = [...merged.values()].reduce((acc, row) => acc + row.amount, 0)
  return [...merged.entries()]
    .map(([id, row]) => ({
      id,
      name: row.name,
      amount: row.amount,
      share: total > 0 ? row.amount / total : 0,
    }))
    .sort((a, b) =>
      a.amount === b.amount ? a.name.localeCompare(b.name, 'fr') : b.amount - a.amount,
    )
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0)
}

/** Comparaison insensible à la casse et aux accents. */
function looseEquals(a: string, b: string): boolean {
  return (
    a.localeCompare(b, 'fr', { sensitivity: 'base', usage: 'search' }) === 0
  )
}

// MARK: - Conseil contextuel

export interface Advice {
  tone: 'neutral' | 'positive' | 'warning' | 'critical'
  title: string
  message: string
}

/**
 * Conseil du tableau de bord, calculé à partir des chiffres réels du mois.
 *
 * Un seul message à la fois : plusieurs conseils simultanés se neutralisent.
 * `today` est injecté pour rendre la fonction pure et testable.
 */
export function adviceFor(summary: MonthSummary, today: Date = new Date()): Advice {
  const money = (value: number) => formatEuros(value)

  if (summary.salary <= 0) {
    return {
      tone: 'neutral',
      title: 'Renseignez votre salaire',
      message:
        'Sans le salaire du mois, impossible de calculer le reste disponible, l’épargne ou la jauge de consommation.',
    }
  }

  if (summary.remaining < 0) {
    return {
      tone: 'critical',
      title: 'Budget dépassé',
      message: `Vous avez dépensé ${money(-summary.remaining)} de plus que votre salaire ce mois-ci.`,
    }
  }

  if (summary.forecastRemaining < 0) {
    return {
      tone: 'warning',
      title: 'Dépassement prévu',
      message: `Avec les récurrentes encore à venir, les dépenses dépasseraient le salaire de ${money(-summary.forecastRemaining)}.`,
    }
  }

  // Rythme de dépense : ne vaut que pour le mois en cours, et seulement une
  // fois quelques jours écoulés — sinon la projection n'a aucun sens.
  const pace = paceProjection(summary, today)
  if (pace && pace.projected > summary.salary) {
    return {
      tone: 'warning',
      title: 'Rythme trop rapide',
      message: `À ce rythme vous termineriez le mois à ${money(pace.projected)}, soit ${money(pace.projected - summary.salary)} au-dessus de votre salaire.`,
    }
  }

  if (summary.consumption >= 0.8) {
    return {
      tone: 'warning',
      title: 'Plus de 80 % consommé',
      message: `Il reste ${money(summary.remaining)} pour finir le mois.`,
    }
  }

  if (pace) {
    return {
      tone: 'positive',
      title: 'Rythme maîtrisé',
      message: `Votre rythme actuel vous laisse environ ${money(Math.max(0, summary.salary - pace.projected))} d’ici la fin du mois.`,
    }
  }

  if (summary.savingsGoal > 0 && summary.realSavings >= summary.savingsGoal) {
    return {
      tone: 'positive',
      title: 'Objectif d’épargne atteint',
      message: `Vous mettez de côté ${money(summary.realSavings)} ce mois-ci, pour un objectif de ${money(summary.savingsGoal)}.`,
    }
  }

  return {
    tone: 'positive',
    title: 'Budget sous contrôle',
    message: `Votre épargne réelle est de ${money(summary.realSavings)}, soit ${Math.round((summary.realSavings / summary.salary) * 100)} % du salaire.`,
  }
}

/**
 * Projection de fin de mois au rythme actuel.
 *
 * Renvoie `null` hors du mois en cours, ou avant le 5 du mois : trois jours de
 * données extrapolés sur trente donneraient un chiffre absurde.
 */
export function paceProjection(
  summary: MonthSummary,
  today: Date = new Date(),
): { elapsed: number; length: number; projected: number } | null {
  const isCurrentMonth =
    today.getFullYear() === summary.year && today.getMonth() + 1 === summary.month
  if (!isCurrentMonth) return null

  const elapsed = today.getDate()
  if (elapsed < 5) return null

  const length = new Date(summary.year, summary.month, 0).getDate()
  const variable = summary.total - summary.byType.fixe
  // Seules les dépenses non fixes suivent un rythme ; les fixes sont ajoutées
  // en bloc via les récurrentes attendues.
  const projected =
    summary.byType.fixe + summary.expectedRemaining + (variable / elapsed) * length

  return { elapsed, length, projected }
}

function formatEuros(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
