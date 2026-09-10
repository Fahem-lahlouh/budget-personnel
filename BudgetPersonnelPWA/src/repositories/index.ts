import { db, defaultSettings, normalizeSettings } from './db'
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
import type {
  CategorizationRule,
  ImportSession,
  ImportedTransaction,
  MerchantAlias,
} from '@/models/import'
import type { Receipt, ReceiptImage, ReceiptItem } from '@/models/receipt'
import { buildSearchIndex } from '@/models/receipt'

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

/** Tout ce qu'il faut pour annuler une suppression de dépense. */
export interface DeletedExpense {
  expense: Expense
  receipt: Receipt | null
  image: ReceiptImage | null
}

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

  /**
   * Supprime la dépense et, avec elle, le ticket qui la documentait.
   *
   * Retourne de quoi la remettre exactement en place : c'est ce qui permet
   * d'offrir un « Annuler » après coup plutôt qu'une perte sèche.
   */
  async remove(id: string): Promise<DeletedExpense | null> {
    return db.transaction('rw', [db.expenses, db.receipts, db.receiptImages], async () => {
      const expense = await db.expenses.get(id)
      if (!expense) return null

      const receipt = (await db.receipts.where('expenseId').equals(id).first()) ?? null
      const image = receipt ? ((await db.receiptImages.get(receipt.id)) ?? null) : null

      if (receipt) {
        await db.receiptImages.delete(receipt.id)
        await db.receipts.delete(receipt.id)
      }
      await db.expenses.delete(id)

      return { expense, receipt, image }
    })
  },

  /**
   * Remet en place une dépense supprimée, avec son ticket et sa photo.
   *
   * Les enregistrements sont réécrits tels quels, identifiants compris : rien
   * n'est recréé, donc rien ne se désolidarise — le ticket retrouve sa dépense
   * et la photo son ticket.
   */
  async restore(deleted: DeletedExpense): Promise<void> {
    await db.transaction('rw', [db.expenses, db.receipts, db.receiptImages], async () => {
      await db.expenses.put(deleted.expense)
      if (deleted.receipt) await db.receipts.put(deleted.receipt)
      if (deleted.image) await db.receiptImages.put(deleted.image)
    })
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
    if (!existing) {
      const created = defaultSettings()
      await db.settings.put(created)
      return created
    }
    // Complète les champs ajoutés depuis l'écriture de cet enregistrement,
    // pour un navigateur qui a déjà une base créée par une version antérieure.
    return normalizeSettings(existing)
  },

  async update(patch: Partial<Omit<AppSettings, 'id'>>): Promise<AppSettings> {
    const current = await settingsRepository.get()
    const next: AppSettings = {
      ...current,
      ...patch,
      protectedFields: { ...current.protectedFields, ...patch.protectedFields },
    }
    await db.settings.put(next)
    return next
  },
}

// MARK: - Import depuis image (OCR local)

export const importSessionRepository = {
  async all(): Promise<ImportSession[]> {
    const rows = await db.importSessions.toArray()
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },

  async create(input: Omit<ImportSession, 'id'>): Promise<ImportSession> {
    const session: ImportSession = { ...input, id: newId('imp') }
    await db.importSessions.add(session)
    return session
  },

  async update(id: string, patch: Partial<Omit<ImportSession, 'id'>>): Promise<void> {
    await db.importSessions.update(id, patch)
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', [db.importSessions, db.importedTransactions], async () => {
      await db.importSessions.delete(id)
      await db.importedTransactions.where('sessionId').equals(id).delete()
    })
  },
}

export const importedTransactionRepository = {
  async forSession(sessionId: string): Promise<ImportedTransaction[]> {
    return db.importedTransactions.where('sessionId').equals(sessionId).toArray()
  },

  async bulkCreate(rows: ImportedTransaction[]): Promise<void> {
    await db.importedTransactions.bulkAdd(rows)
  },

  async update(id: string, patch: Partial<Omit<ImportedTransaction, 'id'>>): Promise<void> {
    await db.importedTransactions.update(id, patch)
  },

  /** Empreintes déjà connues, tous imports confondus, pour la détection de doublons. */
  async allFingerprints(): Promise<Set<string>> {
    const rows = await db.importedTransactions
      .filter((row) => row.status === 'validee')
      .toArray()
    return new Set(rows.map((row) => row.fingerprint))
  },
}

export const merchantAliasRepository = {
  async all(): Promise<MerchantAlias[]> {
    return db.merchantAliases.toArray()
  },

  /** Remplace tout alias existant pour ce motif : la dernière correction gagne. */
  async learn(normalizedPattern: string, merchantId: string): Promise<void> {
    const existing = await db.merchantAliases
      .where('normalizedPattern')
      .equals(normalizedPattern)
      .first()
    if (existing) {
      await db.merchantAliases.update(existing.id, { merchantId })
      return
    }
    await db.merchantAliases.add({
      id: newId('alias'),
      normalizedPattern,
      merchantId,
      createdAt: new Date().toISOString(),
    })
  },

  async find(normalizedPattern: string): Promise<MerchantAlias | undefined> {
    return db.merchantAliases.where('normalizedPattern').equals(normalizedPattern).first()
  },
}

export const categorizationRuleRepository = {
  async all(): Promise<CategorizationRule[]> {
    return db.categorizationRules.toArray()
  },

  /** Remplace la règle existante pour ce motif : le dernier choix gagne. */
  async learn(
    normalizedPattern: string,
    categoryId: string,
    merchantId: string | null,
  ): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.categorizationRules
      .where('normalizedPattern')
      .equals(normalizedPattern)
      .first()
    if (existing) {
      await db.categorizationRules.update(existing.id, { categoryId, merchantId, updatedAt: now })
      return
    }
    await db.categorizationRules.add({
      id: newId('rule'),
      normalizedPattern,
      merchantId,
      categoryId,
      expenseType: null,
      createdAt: now,
      updatedAt: now,
    })
  },

  async find(normalizedPattern: string): Promise<CategorizationRule | undefined> {
    return db.categorizationRules.where('normalizedPattern').equals(normalizedPattern).first()
  },
}

// MARK: - Amorçage & réinitialisation

/** Installe les listes de référence si elles sont absentes. */
// MARK: - Tickets de caisse

export interface NewReceipt {
  expenseId: string
  merchantName: string
  purchasedAt: string | null
  total: number
  items: Omit<ReceiptItem, 'id'>[]
  rawText: string
  /** Photo à conserver. `null` quand le réglage la refuse ou qu'il n'y en a pas. */
  image: Blob | null
}

export const receiptRepository = {
  async all(): Promise<Receipt[]> {
    return db.receipts.toArray()
  },

  async forExpense(expenseId: string): Promise<Receipt | undefined> {
    return db.receipts.where('expenseId').equals(expenseId).first()
  },

  /**
   * Enregistre le ticket et sa photo d'un seul tenant : jamais de photo
   * orpheline si l'écriture du ticket échoue.
   */
  async create(input: NewReceipt): Promise<Receipt> {
    const id = newId('receipt')
    const items: ReceiptItem[] = input.items.map((item) => ({ ...item, id: newId('item') }))
    const receipt: Receipt = {
      id,
      expenseId: input.expenseId,
      merchantName: input.merchantName,
      purchasedAt: input.purchasedAt,
      total: input.total,
      items,
      rawText: input.rawText,
      searchIndex: buildSearchIndex(input.merchantName, items),
      hasImage: input.image !== null,
      createdAt: new Date().toISOString(),
    }

    await db.transaction('rw', [db.receipts, db.receiptImages], async () => {
      await db.receipts.put(receipt)
      if (input.image) {
        await db.receiptImages.put({
          id,
          receiptId: id,
          blob: input.image,
          mimeType: input.image.type || 'image/jpeg',
          byteSize: input.image.size,
        })
      }
    })

    return receipt
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', [db.receipts, db.receiptImages], async () => {
      await db.receiptImages.delete(id)
      await db.receipts.delete(id)
    })
  },
}

export const receiptImageRepository = {
  async get(receiptId: string): Promise<ReceiptImage | undefined> {
    return db.receiptImages.get(receiptId)
  },

  /** Octets occupés par l'ensemble des photos, pour l'écran Réglages. */
  async totalBytes(): Promise<number> {
    let total = 0
    await db.receiptImages.each((image) => {
      total += image.byteSize
    })
    return total
  },

  async count(): Promise<number> {
    return db.receiptImages.count()
  },

  /**
   * Supprime toutes les photos en gardant les tickets : couper le réglage ne
   * doit pas faire perdre le détail des articles déjà extrait.
   */
  async removeAll(): Promise<void> {
    await db.transaction('rw', [db.receipts, db.receiptImages], async () => {
      await db.receiptImages.clear()
      await db.receipts.toCollection().modify({ hasImage: false })
    })
  },
}

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
    [
      db.expenses,
      db.recurring,
      db.monthBudgets,
      db.categories,
      db.merchants,
      db.importSessions,
      db.importedTransactions,
      db.merchantAliases,
      db.categorizationRules,
      db.receipts,
      db.receiptImages,
    ],
    async () => {
      await Promise.all([
        db.expenses.clear(),
        db.recurring.clear(),
        db.monthBudgets.clear(),
        db.categories.clear(),
        db.merchants.clear(),
        db.importSessions.clear(),
        db.importedTransactions.clear(),
        db.merchantAliases.clear(),
        db.categorizationRules.clear(),
        db.receipts.clear(),
        db.receiptImages.clear(),
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
