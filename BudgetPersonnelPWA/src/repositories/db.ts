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
import { SCHEMA_VERSION } from '@/models/types'

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
    secondLevelForConfidential: true,
    demoSeeded: false,
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
