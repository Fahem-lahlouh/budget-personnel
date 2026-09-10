import Dexie, { type EntityTable } from 'dexie'
import type {
  AppSettings,
  Category,
  Expense,
  Merchant,
  MonthBudget,
  PinRecord,
  RecurringExpense,
  WebAuthnRecord,
} from '@/models/types'
import { DEFAULT_PROTECTED_FIELDS, SCHEMA_VERSION } from '@/models/types'
import type {
  CategorizationRule,
  ImportSession,
  ImportedTransaction,
  MerchantAlias,
} from '@/models/import'
import type { Receipt, ReceiptImage } from '@/models/receipt'

/**
 * Base IndexedDB de l'application.
 *
 * Tout est local : aucune de ces tables n'est synchronisée, envoyée ou
 * sauvegardée ailleurs que sur l'appareil.
 *
 * ## Faire évoluer le schéma
 *
 * Ajouter un `this.version(n + 1).stores({...}).upgrade(tx => ...)` **sans
 * toucher aux versions précédentes** : Dexie rejoue les migrations dans
 * l'ordre, ce qui préserve les dépenses déjà saisies. Penser à incrémenter
 * `SCHEMA_VERSION` dans `models/types.ts` — il voyage avec les sauvegardes JSON
 * et permet de refuser un fichier trop récent.
 */
export class BudgetDatabase extends Dexie {
  expenses!: EntityTable<Expense, 'id'>
  categories!: EntityTable<Category, 'id'>
  merchants!: EntityTable<Merchant, 'id'>
  recurring!: EntityTable<RecurringExpense, 'id'>
  monthBudgets!: EntityTable<MonthBudget, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  credentials!: EntityTable<PinRecord | WebAuthnRecord, 'id'>
  // Import depuis image (OCR local) : historique, règles apprises.
  importSessions!: EntityTable<ImportSession, 'id'>
  importedTransactions!: EntityTable<ImportedTransaction, 'id'>
  merchantAliases!: EntityTable<MerchantAlias, 'id'>
  categorizationRules!: EntityTable<CategorizationRule, 'id'>
  // Tickets de caisse photographiés : le détail, et la photo à part.
  receipts!: EntityTable<Receipt, 'id'>
  receiptImages!: EntityTable<ReceiptImage, 'id'>

  constructor(name = 'budget-personnel') {
    super(name)

    this.version(1).stores({
      // `monthKey` est indexé : c'est le filtre de tous les écrans mensuels,
      // et il évite de charger toute la base pour afficher un seul mois.
      expenses: 'id, monthKey, date, categoryId, merchantId, status, type, recurringId',
      categories: 'id, sortOrder, name',
      merchants: 'id, sortOrder, name',
      recurring: 'id, sortOrder, active, categoryId',
      monthBudgets: 'id, year',
      settings: 'id',
      credentials: 'id',
    })

    // v2 : import de transactions depuis une image (OCR local) et moteur de
    // catégorisation apprenant. Tables neuves uniquement — Dexie rejoue la v1
    // avant celle-ci, aucune dépense existante n'est touchée.
    this.version(2).stores({
      importSessions: 'id, createdAt',
      importedTransactions: 'id, sessionId, fingerprint',
      merchantAliases: 'id, &normalizedPattern, merchantId',
      categorizationRules: 'id, &normalizedPattern, merchantId, categoryId',
    })

    // v3 : tickets de caisse photographiés. Deux tables neuves, aucune colonne
    // ajoutée aux dépenses : une dépense d'avant cette version reste valide
    // telle quelle, simplement sans ticket. Les photos sont à part pour que
    // lister les tickets ne charge pas les images avec.
    this.version(3).stores({
      receipts: 'id, &expenseId, createdAt',
      receiptImages: 'id, receiptId',
    })
  }
}

export const db = new BudgetDatabase()

/** Réglages par défaut d'une installation neuve. */
export function defaultSettings(): AppSettings {
  return {
    id: 'settings',
    schemaVersion: SCHEMA_VERSION,
    theme: 'system',
    lockEnabled: false,
    biometricsEnabled: false,
    pinLength: 6,
    protectedFields: { ...DEFAULT_PROTECTED_FIELDS },
    unlockDuration: 'background',
    keepReceiptImages: true,
    demoSeeded: false,
  }
}

/**
 * Complète un enregistrement de réglages avec les valeurs par défaut des
 * champs ajoutés depuis. Un enregistrement écrit par une version antérieure
 * de l'app n'a pas ces clés : sans ce filet, `settings.protectedFields`
 * vaudrait `undefined` et ferait planter l'écran de confidentialité.
 */
export function normalizeSettings(stored: AppSettings): AppSettings {
  const fallback = defaultSettings()
  return {
    ...fallback,
    ...stored,
    protectedFields: { ...fallback.protectedFields, ...stored.protectedFields },
  }
}

/**
 * Demande au navigateur de ne pas évincer la base sous pression de stockage.
 *
 * Safari n'accorde pas toujours cette permission, et peut effacer les données
 * d'un site non utilisé pendant plusieurs semaines : c'est précisément pour ça
 * que l'app insiste sur les sauvegardes JSON. Renvoie l'état obtenu, affiché
 * dans les Réglages.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Estimation de l'espace occupé, pour l'écran Réglages. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}
