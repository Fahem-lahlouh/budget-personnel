import { db, defaultSettings } from './db'
import type {
  AppSettings,
  Category,
  Expense,
  Merchant,
  MonthBudget,
  RecurringExpense,
} from '@/models/types'
import { makeMonthKey, monthKeyOf } from '@/models/types'
import {
  SEED_CATEGORIES,
  SEED_MERCHANTS,
  SEED_RECURRING,
  buildDemoBudget,
  buildDemoExpenses,
} from '@/data/seed'

/**
 * Accès aux données. Les composants ne parlent jamais à Dexie directement :
 * ils passent par ces fonctions, ce qui laisse la porte ouverte à un changement
 * de moteur de stockage sans toucher à l'interface.
 */

function newId(prefix: string): string {
  const random =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `${prefix}-${random}`
}

// MARK: - Dépenses

export const expenseRepository = {
  async all(): Promise<Expense[]> {
    return db.expenses.toArray()
  },

  /** Dépenses d'un mois, triées de la plus récente à la plus ancienne. */
  async forMonth(year: number, month: number): Promise<Expense[]> {
    const rows = await db.expenses.where('monthKey').equals(makeMonthKey(year, month)).toArray()
    return rows.sort(compareByDateDesc)
  },

  /** Dépenses d'une année entière (les 12 clés mensuelles d'un coup). */
  async forYear(year: number): Promise<Expense[]> {
    const keys = Array.from({ length: 12 }, (_, i) => makeMonthKey(year, i + 1))
    const rows = await db.expenses.where('monthKey').anyOf(keys).toArray()
    return rows.sort(compareByDateDesc)
  },

  async get(id: string): Promise<Expense | undefined> {
    return db.expenses.get(id)
  },

  async create(
    input: Omit<Expense, 'id' | 'monthKey' | 'createdAt' | 'updatedAt'>,
  ): Promise<Expense> {
    const now = new Date().toISOString()
    const expense: Expense = {
      ...input,
      id: newId('exp'),
      monthKey: monthKeyOf(input.date),
      createdAt: now,
      updatedAt: now,
    }
    await db.expenses.add(expense)
    return expense
  },

  async update(id: string, patch: Partial<Omit<Expense, 'id'>>): Promise<void> {
    const next: Partial<Expense> = { ...patch, updatedAt: new Date().toISOString() }
    // La clé de mois est dérivée de la date : la recalculer ici évite qu'une
    // dépense déplacée d'un mois à l'autre reste indexée sur l'ancien.
    if (patch.date) next.monthKey = monthKeyOf(patch.date)
    await db.expenses.update(id, next)
  },

  async remove(id: string): Promise<void> {
    await db.expenses.delete(id)
  },

  async countAll(): Promise<number> {
    return db.expenses.count()
  },
}

function compareByDateDesc(a: Expense, b: Expense): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.createdAt < b.createdAt ? 1 : -1
}

// MARK: - Catégories

export const categoryRepository = {
  async all(): Promise<Category[]> {
    return (await db.categories.toArray()).sort((a, b) => a.sortOrder - b.sortOrder)
  },

  async create(name: string, icon = 'tag'): Promise<Category> {
    const existing = await db.categories.toArray()
    const category: Category = {
      id: newId('cat'),
      name,
      icon,
      sortOrder: existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
    }
    await db.categories.add(category)
    return category
  },

  /**
   * Renomme sans toucher aux dépenses : elles référencent l'identifiant, pas
   * le libellé. C'est tout l'intérêt du modèle par ID.
   */
  async rename(id: string, name: string): Promise<void> {
    await db.categories.update(id, { name })
  },

  async setIcon(id: string, icon: string): Promise<void> {
    await db.categories.update(id, { icon })
  },

  async remove(id: string): Promise<void> {
    await db.categories.delete(id)
  },

  async reorder(orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.categories, async () => {
      await Promise.all(
        orderedIds.map((id, index) => db.categories.update(id, { sortOrder: index })),
      )
    })
  },

  /** Nombre de dépenses rattachées, pour prévenir avant suppression. */
  async usageCount(id: string): Promise<number> {
    return db.expenses.where('categoryId').equals(id).count()
  },
}

// MARK: - Enseignes

export const merchantRepository = {
  async all(): Promise<Merchant[]> {
    return (await db.merchants.toArray()).sort((a, b) => a.sortOrder - b.sortOrder)
  },

  async create(name: string): Promise<Merchant> {
    const existing = await db.merchants.toArray()
    const merchant: Merchant = {
      id: newId('mer'),
      name,
      sortOrder: existing.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
    }
    await db.merchants.add(merchant)
    return merchant
  },

  async rename(id: string, name: string): Promise<void> {
    await db.merchants.update(id, { name })
  },

  async remove(id: string): Promise<void> {
    await db.merchants.delete(id)
  },

  async reorder(orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.merchants, async () => {
      await Promise.all(
        orderedIds.map((id, index) => db.merchants.update(id, { sortOrder: index })),
      )
    })
  },

  async usageCount(id: string): Promise<number> {
    return db.expenses.where('merchantId').equals(id).count()
  },
}

// MARK: - Récurrentes

export const recurringRepository = {
  async all(): Promise<RecurringExpense[]> {
    const rows = await db.recurring.toArray()
    return rows.sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.sortOrder - b.sortOrder)
  },

  async create(input: Omit<RecurringExpense, 'id' | 'sortOrder'>): Promise<RecurringExpense> {
    const existing = await db.recurring.toArray()
    const item: RecurringExpense = {
      ...input,
      id: newId('rec'),
      sortOrder: existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1,
    }
    await db.recurring.add(item)
    return item
  },

  async update(id: string, patch: Partial<Omit<RecurringExpense, 'id'>>): Promise<void> {
    await db.recurring.update(id, patch)
  },

  async remove(id: string): Promise<void> {
    await db.recurring.delete(id)
  },
}

// MARK: - Budgets mensuels

export const monthBudgetRepository = {
  async all(): Promise<MonthBudget[]> {
    return db.monthBudgets.toArray()
  },

  async forYear(year: number): Promise<MonthBudget[]> {
    return db.monthBudgets.where('year').equals(year).toArray()
  },

  async get(year: number, month: number): Promise<MonthBudget | undefined> {
    return db.monthBudgets.get(makeMonthKey(year, month))
  },

  async set(year: number, month: number, salary: number, savingsGoal: number): Promise<void> {
    await db.monthBudgets.put({ id: makeMonthKey(year, month), year, month, salary, savingsGoal })
  },

  /** Dernier mois renseigné avant celui-ci, pour pré-remplir la saisie. */
  async latestBefore(year: number, month: number): Promise<MonthBudget | undefined> {
    const key = makeMonthKey(year, month)
    const rows = await db.monthBudgets.toArray()
    return rows
      .filter((row) => row.id < key && row.salary > 0)
      .sort((a, b) => (a.id < b.id ? 1 : -1))[0]
  },
}

// MARK: - Réglages

export const settingsRepository = {
  async get(): Promise<AppSettings> {
    const existing = await db.settings.get('settings')
    if (existing) return existing
    const created = defaultSettings()
    await db.settings.put(created)
    return created
  },

  async update(patch: Partial<Omit<AppSettings, 'id'>>): Promise<AppSettings> {
    const current = await settingsRepository.get()
    const next = { ...current, ...patch }
    await db.settings.put(next)
    return next
  },
}

// MARK: - Amorçage & réinitialisation

/** Installe les listes de référence si elles sont absentes. */
export async function installListsIfNeeded(): Promise<void> {
  if ((await db.categories.count()) === 0) await db.categories.bulkAdd(SEED_CATEGORIES)
  if ((await db.merchants.count()) === 0) await db.merchants.bulkAdd(SEED_MERCHANTS)
}

/** Charge le jeu de démonstration sur le mois en cours. */
export async function installDemoData(reference: Date = new Date()): Promise<void> {
  await db.recurring.bulkPut(SEED_RECURRING)
  await db.expenses.bulkPut(buildDemoExpenses(reference))
  await db.monthBudgets.put(buildDemoBudget(reference))
}

/**
 * Amorçage au premier lancement.
 *
 * Le jeu de démonstration n'est posé qu'une fois : le drapeau `demoSeeded`
 * garantit qu'il ne réapparaît pas après que l'utilisateur a tout effacé.
 */
export async function bootstrap(reference: Date = new Date()): Promise<AppSettings> {
  await installListsIfNeeded()
  let settings = await settingsRepository.get()

  if (!settings.demoSeeded) {
    if ((await db.expenses.count()) === 0) await installDemoData(reference)
    settings = await settingsRepository.update({ demoSeeded: true })
  }

  return settings
}

/** Efface les données saisies et restaure les listes par défaut. */
export async function wipeAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.expenses, db.recurring, db.monthBudgets, db.categories, db.merchants],
    async () => {
      await Promise.all([
        db.expenses.clear(),
        db.recurring.clear(),
        db.monthBudgets.clear(),
        db.categories.clear(),
        db.merchants.clear(),
      ])
    },
  )
  await installListsIfNeeded()
}

/** Remet l'app dans l'état du premier lancement, démonstration comprise. */
export async function resetToDemoData(reference: Date = new Date()): Promise<void> {
  await wipeAllData()
  await installDemoData(reference)
}
