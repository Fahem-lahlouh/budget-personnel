import { describe, expect, it } from 'vitest'
import {
  adviceFor,
  categoryDetailSummary,
  merchantDetailSummary,
  paceProjection,
  plannedAmountFor,
  recurringStatuses,
  summarizeMonth,
  summarizeYear,
  topWithOthers,
  varianceOf,
  type NamedTotal,
} from '@/services/budgetEngine'
import type { Expense, MonthBudget, RecurringExpense } from '@/models/types'

// MARK: - Fabriques

let counter = 0

function expense(partial: Partial<Expense> = {}): Expense {
  counter += 1
  const date = partial.date ?? '2026-09-10'
  return {
    id: partial.id ?? `e${counter}`,
    date,
    monthKey: date.slice(0, 7),
    categoryId: 'cat-courses',
    merchantId: '',
    description: '',
    amount: 100,
    type: 'variable',
    plannedAmount: null,
    status: 'paye',
    note: '',
    confidential: false,
    recurringId: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...partial,
    // `monthKey` est dérivé : il ne doit jamais diverger de `date`.
    ...(partial.date ? { monthKey: partial.date.slice(0, 7) } : {}),
  }
}

function recurring(partial: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: 'rec-1',
    categoryId: 'cat-logement',
    merchantId: '',
    description: 'Loyer',
    plannedAmount: 800,
    dayOfMonth: 5,
    type: 'fixe',
    note: '',
    confidential: false,
    active: true,
    sortOrder: 0,
    ...partial,
  }
}

function budget(partial: Partial<MonthBudget> = {}): MonthBudget {
  return { id: '2026-09', year: 2026, month: 9, salary: 3000, savingsGoal: 300, ...partial }
}

const base = { year: 2026, month: 9 } as const

describe('summarizeMonth — totaux', () => {
  it('ne compte que les dépenses du mois demandé', () => {
    const summary = summarizeMonth({
      expenses: [
        expense({ amount: 100, date: '2026-09-03' }),
        expense({ amount: 50, date: '2026-09-20' }),
        expense({ amount: 999, date: '2026-08-31' }),
        expense({ amount: 999, date: '2026-10-01' }),
      ],
      recurring: [],
      budget: budget(),
      ...base,
    })

    expect(summary.total).toBe(150)
    expect(summary.count).toBe(2)
  })

  it('renvoie une synthèse vide sans dépense ni budget', () => {
    const summary = summarizeMonth({ expenses: [], recurring: [], budget: null, ...base })

    expect(summary.total).toBe(0)
    expect(summary.salary).toBe(0)
    expect(summary.consumption).toBe(0)
    expect(summary.byCategory).toEqual([])
    expect(summary.isOverBudget).toBe(false)
  })
})

describe('summarizeMonth — reste, épargne et consommation', () => {
  it('calcule le reste et la consommation', () => {
    const summary = summarizeMonth({
      expenses: [expense({ amount: 1200 })],
      recurring: [],
      budget: budget({ salary: 3000 }),
      ...base,
    })

    expect(summary.remaining).toBe(1800)
    expect(summary.realSavings).toBe(1800)
    expect(summary.consumption).toBeCloseTo(0.4)
    expect(summary.isOverBudget).toBe(false)
  })

  it('borne l’épargne réelle à zéro en cas de dépassement', () => {
    const summary = summarizeMonth({
      expenses: [expense({ amount: 3500 })],
      recurring: [],
      budget: budget({ salary: 3000 }),
      ...base,
    })

    expect(summary.remaining).toBe(-500)
    expect(summary.realSavings).toBe(0)
    expect(summary.isOverBudget).toBe(true)
    expect(summary.consumption).toBeCloseTo(3500 / 3000)
  })

  it('évite la division par zéro quand le salaire est absent', () => {
    const summary = summarizeMonth({
      expenses: [expense({ amount: 500 })],
      recurring: [],
      budget: budget({ salary: 0 }),
      ...base,
    })

    expect(summary.consumption).toBe(0)
    expect(summary.savingsProgress).toBe(0)
  })

  it('borne la progression vers l’objectif à 1', () => {
    const summary = summarizeMonth({
      expenses: [expense({ amount: 100 })],
      recurring: [],
      budget: budget({ salary: 3000, savingsGoal: 300 }),
      ...base,
    })

    expect(summary.realSavings).toBe(2900)
    expect(summary.savingsProgress).toBe(1)
  })
})

describe('summarizeMonth — répartitions', () => {
  it('regroupe par catégorie, trié par montant décroissant', () => {
    const summary = summarizeMonth({
      expenses: [
        expense({ categoryId: 'cat-a', amount: 100 }),
        expense({ categoryId: 'cat-b', amount: 300 }),
        expense({ categoryId: 'cat-a', amount: 50 }),
      ],
      recurring: [],
      budget: budget(),
      categoryName: (id) => ({ 'cat-a': 'Courses', 'cat-b': 'Logement' })[id],
      ...base,
    })

    expect(summary.byCategory.map((c) => [c.name, c.amount])).toEqual([
      ['Logement', 300],
      ['Courses', 150],
    ])
    expect(summary.byCategory[0].share).toBeCloseTo(300 / 450)
  })

  it('exclut les dépenses sans enseigne du classement des enseignes', () => {
    const summary = summarizeMonth({
      expenses: [
        expense({ merchantId: 'mer-lidl', amount: 40 }),
        expense({ merchantId: '', amount: 500 }),
      ],
      recurring: [],
      budget: budget(),
      ...base,
    })

    expect(summary.byMerchant).toHaveLength(1)
    expect(summary.byMerchant[0].amount).toBe(40)
    // La part reste rapportée au total du mois, enseigne renseignée ou non.
    expect(summary.byMerchant[0].share).toBeCloseTo(40 / 540)
  })

  it('ventile par type et par statut, et compte les impayées', () => {
    const summary = summarizeMonth({
      expenses: [
        expense({ type: 'fixe', status: 'paye', amount: 800 }),
        expense({ type: 'variable', status: 'aPayer', amount: 120 }),
        expense({ type: 'exceptionnelle', status: 'aPayer', amount: 60 }),
      ],
      recurring: [],
      budget: budget(),
      ...base,
    })

    expect(summary.byType).toEqual({ fixe: 800, variable: 120, exceptionnelle: 60 })
    expect(summary.byStatus).toEqual({ paye: 800, aPayer: 180 })
    expect(summary.unpaidCount).toBe(2)
  })

  it('garde un ordre stable quand deux montants sont égaux', () => {
    const summary = summarizeMonth({
      expenses: [
        expense({ categoryId: 'z', amount: 100 }),
        expense({ categoryId: 'a', amount: 100 }),
      ],
      recurring: [],
      budget: budget(),
      categoryName: (id) => (id === 'z' ? 'Zèbre' : 'Abeille'),
      ...base,
    })

    expect(summary.byCategory.map((c) => c.name)).toEqual(['Abeille', 'Zèbre'])
  })
})

describe('summarizeMonth — prévisions', () => {
  it('ajoute les récurrentes non saisies au total projeté', () => {
    const summary = summarizeMonth({
      expenses: [expense({ amount: 200 })],
      recurring: [
        recurring({ id: 'rec-1', description: 'Loyer', plannedAmount: 800 }),
        recurring({ id: 'rec-2', description: 'Fibre', plannedAmount: 30 }),
      ],
      budget: budget({ salary: 3000 }),
      ...base,
    })

    expect(summary.expectedRemaining).toBe(830)
    expect(summary.forecastTotal).toBe(1030)
    expect(summary.forecastRemaining).toBe(1970)
  })

  it('n’attend plus une récurrente déjà saisie', () => {
    const summary = summarizeMonth({
      expenses: [expense({ description: 'Loyer', amount: 800, recurringId: 'rec-1' })],
      recurring: [recurring({ id: 'rec-1', description: 'Loyer', plannedAmount: 800 })],
      budget: budget(),
      ...base,
    })

    expect(summary.expectedRemaining).toBe(0)
    expect(summary.forecastTotal).toBe(800)
  })

  it('ignore les récurrentes désactivées', () => {
    const summary = summarizeMonth({
      expenses: [],
      recurring: [recurring({ plannedAmount: 800, active: false })],
      budget: budget(),
      ...base,
    })

    expect(summary.expectedRemaining).toBe(0)
  })
})

describe('recurringStatuses', () => {
  it('rattache par identifiant en priorité', () => {
    const [status] = recurringStatuses({
      expenses: [expense({ description: 'Autre libellé', recurringId: 'rec-1' })],
      recurring: [recurring({ id: 'rec-1', description: 'Loyer' })],
      ...base,
    })

    expect(status.isMissing).toBe(false)
    expect(status.matched?.recurringId).toBe('rec-1')
  })

  it('retombe sur le libellé, insensible à la casse et aux accents', () => {
    const [status] = recurringStatuses({
      expenses: [expense({ description: 'electricite' })],
      recurring: [recurring({ description: 'Électricité' })],
      ...base,
    })

    expect(status.isMissing).toBe(false)
  })

  it('signale une dépense saisie mais non réglée', () => {
    const [status] = recurringStatuses({
      expenses: [expense({ description: 'Loyer', status: 'aPayer' })],
      recurring: [recurring({ description: 'Loyer' })],
      ...base,
    })

    expect(status.isMissing).toBe(false)
    expect(status.isPending).toBe(true)
    expect(status.needsAttention).toBe(true)
  })

  it('ramène une échéance au 31 sur le dernier jour d’un mois court', () => {
    const [status] = recurringStatuses({
      expenses: [],
      recurring: [recurring({ dayOfMonth: 31 })],
      year: 2026,
      month: 2,
    })

    expect(status.dueDate).toBe('2026-02-28')
  })

  it('trie par jour du mois', () => {
    const statuses = recurringStatuses({
      expenses: [],
      recurring: [
        recurring({ id: 'a', dayOfMonth: 20, description: 'Vingt' }),
        recurring({ id: 'b', dayOfMonth: 5, description: 'Cinq' }),
      ],
      ...base,
    })

    expect(statuses.map((s) => s.recurring.description)).toEqual(['Cinq', 'Vingt'])
  })
})

describe('summarizeYear', () => {
  const expenses = [
    expense({ date: '2026-01-10', amount: 1000, categoryId: 'cat-a' }),
    expense({ date: '2026-03-10', amount: 2000, categoryId: 'cat-a' }),
    expense({ date: '2026-03-15', amount: 500, categoryId: 'cat-b' }),
  ]
  const budgets = [
    budget({ id: '2026-01', month: 1, salary: 3000 }),
    budget({ id: '2026-03', month: 3, salary: 3000 }),
  ]

  it('produit toujours douze mois', () => {
    const year = summarizeYear({ expenses, recurring: [], budgets, year: 2026 })
    expect(year.months).toHaveLength(12)
    expect(year.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('cumule salaires et dépenses', () => {
    const year = summarizeYear({ expenses, recurring: [], budgets, year: 2026 })
    expect(year.total).toBe(3500)
    expect(year.salary).toBe(6000)
    expect(year.remaining).toBe(2500)
    expect(year.count).toBe(3)
  })

  it('calcule la moyenne sur les seuls mois renseignés', () => {
    const year = summarizeYear({ expenses, recurring: [], budgets, year: 2026 })
    // (1000 + 2500) / 2 mois actifs, et non / 12.
    expect(year.monthlyAverage).toBe(1750)
  })

  it('identifie le mois le plus dépensier et le meilleur mois', () => {
    const year = summarizeYear({ expenses, recurring: [], budgets, year: 2026 })
    expect(year.busiestMonth?.month).toBe(3)
    expect(year.bestMonth?.month).toBe(1)
  })

  it('agrège les catégories sur l’année', () => {
    const year = summarizeYear({
      expenses,
      recurring: [],
      budgets,
      year: 2026,
      categoryName: (id) => ({ 'cat-a': 'A', 'cat-b': 'B' })[id],
    })

    expect(year.byCategory.map((c) => [c.name, c.amount])).toEqual([
      ['A', 3000],
      ['B', 500],
    ])
    expect(year.byCategory[0].share).toBeCloseTo(3000 / 3500)
  })

  it('renvoie des cumuls nuls pour une année vide', () => {
    const year = summarizeYear({ expenses: [], recurring: [], budgets: [], year: 2030 })
    expect(year.total).toBe(0)
    expect(year.monthlyAverage).toBe(0)
    expect(year.busiestMonth).toBeNull()
    expect(year.bestMonth).toBeNull()
  })
})

describe('topWithOthers', () => {
  const totals = (amounts: number[]): NamedTotal[] => {
    const sum = amounts.reduce((a, b) => a + b, 0)
    return amounts.map((amount, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      amount,
      share: amount / sum,
    }))
  }

  it('laisse la liste intacte en dessous de la limite', () => {
    expect(topWithOthers(totals([5, 4, 3]), 5)).toHaveLength(3)
  })

  it('distingue le regroupement d’une vraie catégorie nommée « Autres »', () => {
    // Le jeu par défaut contient une catégorie « Autres » : sans garde-fou la
    // légende du donut affichait deux entrées identiques.
    const list: NamedTotal[] = [
      { id: 'c1', name: 'Logement', amount: 500, share: 0.5 },
      { id: 'c2', name: 'Autres', amount: 250, share: 0.25 },
      { id: 'c3', name: 'Courses', amount: 100, share: 0.1 },
      { id: 'c4', name: 'Loisirs', amount: 80, share: 0.08 },
      { id: 'c5', name: 'Santé', amount: 40, share: 0.04 },
      { id: 'c6', name: 'Transport', amount: 30, share: 0.03 },
    ]

    const result = topWithOthers(list, 5)

    expect(result).toHaveLength(6)
    expect(result[5].id).toBe('__others__')
    expect(result[5].name).toBe('Autres catégories')
    // Les deux libellés doivent rester distincts dans la légende.
    expect(new Set(result.map((r) => r.name)).size).toBe(6)
  })

  it('regroupe le reste sous « Autres »', () => {
    const result = topWithOthers(totals([50, 40, 30, 20, 10, 5, 3]), 5)

    expect(result).toHaveLength(6)
    expect(result[5].name).toBe('Autres')
    expect(result[5].amount).toBe(8)
    expect(result.reduce((acc, r) => acc + r.share, 0)).toBeCloseTo(1)
  })
})

describe('varianceOf et plannedAmountFor', () => {
  it('calcule l’écart comme réel − prévu', () => {
    expect(varianceOf({ amount: 120, plannedAmount: 100 })).toBe(20)
    expect(varianceOf({ amount: 80, plannedAmount: 100 })).toBe(-20)
  })

  it('ne renvoie pas d’écart sans montant prévu', () => {
    expect(varianceOf({ amount: 120, plannedAmount: null })).toBeNull()
    expect(varianceOf({ amount: 120, plannedAmount: 0 })).toBeNull()
  })

  it('retrouve le montant prévu depuis une récurrente active', () => {
    const list = [recurring({ description: 'Électricité', plannedAmount: 40 })]
    expect(plannedAmountFor('electricite', list)).toBe(40)
    expect(plannedAmountFor('  ', list)).toBeNull()
    expect(plannedAmountFor('Inconnu', list)).toBeNull()
  })
})

describe('paceProjection et adviceFor', () => {
  const summaryWith = (over: Partial<Parameters<typeof summarizeMonth>[0]> = {}) =>
    summarizeMonth({ expenses: [], recurring: [], budget: budget(), ...base, ...over })

  it('ne projette rien hors du mois en cours', () => {
    const summary = summaryWith({ expenses: [expense({ amount: 500 })] })
    expect(paceProjection(summary, new Date(2026, 10, 15))).toBeNull()
  })

  it('ne projette rien avant le 5 du mois', () => {
    const summary = summaryWith({ expenses: [expense({ amount: 500 })] })
    expect(paceProjection(summary, new Date(2026, 8, 3))).toBeNull()
  })

  it('extrapole les dépenses variables sur la longueur du mois', () => {
    const summary = summaryWith({
      expenses: [
        expense({ amount: 800, type: 'fixe' }),
        expense({ amount: 300, type: 'variable' }),
      ],
    })
    // Au 15 septembre : 300 € de variable sur 15 jours → 600 € sur 30 jours,
    // auxquels s'ajoutent les 800 € de fixe.
    const pace = paceProjection(summary, new Date(2026, 8, 15))
    expect(pace?.projected).toBeCloseTo(1400)
  })

  it('réclame le salaire quand il manque', () => {
    const summary = summaryWith({ budget: budget({ salary: 0 }) })
    expect(adviceFor(summary, new Date(2026, 8, 15)).tone).toBe('neutral')
  })

  it('signale un dépassement déjà constaté', () => {
    const summary = summaryWith({ expenses: [expense({ amount: 3500 })] })
    const advice = adviceFor(summary, new Date(2026, 8, 15))
    expect(advice.tone).toBe('critical')
    expect(advice.title).toBe('Budget dépassé')
  })

  it('signale un dépassement seulement prévu', () => {
    const summary = summaryWith({
      expenses: [expense({ amount: 2500, type: 'fixe' })],
      recurring: [recurring({ plannedAmount: 900 })],
    })
    const advice = adviceFor(summary, new Date(2026, 8, 2))
    expect(advice.tone).toBe('warning')
    expect(advice.title).toBe('Dépassement prévu')
  })

  it('félicite quand le budget est maîtrisé', () => {
    const summary = summaryWith({ expenses: [expense({ amount: 200, type: 'fixe' })] })
    expect(adviceFor(summary, new Date(2026, 8, 15)).tone).toBe('positive')
  })
})

describe('categoryDetailSummary et merchantDetailSummary', () => {
  it('retourne un résumé vide sans dépense correspondante', () => {
    const result = categoryDetailSummary([expense({ categoryId: 'cat-courses' })], 'cat-logement')
    expect(result).toEqual({ plannedTotal: 0, paidTotal: 0, remainingToPay: 0, actualTotal: 0, count: 0 })
  })

  it('exclut les montants prévus null du total prévu', () => {
    const rows = [
      expense({ categoryId: 'cat-courses', plannedAmount: 100, amount: 90 }),
      expense({ categoryId: 'cat-courses', plannedAmount: null, amount: 20 }),
    ]
    const result = categoryDetailSummary(rows, 'cat-courses')
    expect(result.plannedTotal).toBe(100)
  })

  it('sépare le payé du restant à payer selon le statut', () => {
    const rows = [
      expense({ categoryId: 'cat-courses', amount: 50, status: 'paye' }),
      expense({ categoryId: 'cat-courses', amount: 30, status: 'aPayer' }),
    ]
    const result = categoryDetailSummary(rows, 'cat-courses')
    expect(result.paidTotal).toBe(50)
    expect(result.remainingToPay).toBe(30)
  })

  it('actualTotal vaut toujours paidTotal + remainingToPay', () => {
    const rows = [
      expense({ categoryId: 'cat-courses', amount: 50, status: 'paye' }),
      expense({ categoryId: 'cat-courses', amount: 30, status: 'aPayer' }),
      expense({ categoryId: 'cat-courses', amount: 10, status: 'paye' }),
    ]
    const result = categoryDetailSummary(rows, 'cat-courses')
    expect(result.actualTotal).toBe(result.paidTotal + result.remainingToPay)
    expect(result.actualTotal).toBe(90)
    expect(result.count).toBe(3)
  })

  it('filtre par catégorie indépendamment des autres', () => {
    const rows = [
      expense({ categoryId: 'cat-courses', amount: 50 }),
      expense({ categoryId: 'cat-logement', amount: 800 }),
    ]
    expect(categoryDetailSummary(rows, 'cat-courses').count).toBe(1)
    expect(categoryDetailSummary(rows, 'cat-courses').actualTotal).toBe(50)
  })

  it('filtre par enseigne indépendamment de la catégorie', () => {
    const rows = [
      expense({ categoryId: 'cat-courses', merchantId: 'm-lidl', amount: 40, status: 'paye' }),
      expense({ categoryId: 'cat-logement', merchantId: 'm-lidl', amount: 15, status: 'aPayer' }),
      expense({ categoryId: 'cat-courses', merchantId: 'm-auchan', amount: 60, status: 'paye' }),
    ]
    const result = merchantDetailSummary(rows, 'm-lidl')
    expect(result.count).toBe(2)
    expect(result.paidTotal).toBe(40)
    expect(result.remainingToPay).toBe(15)
    expect(result.actualTotal).toBe(55)
  })
})
