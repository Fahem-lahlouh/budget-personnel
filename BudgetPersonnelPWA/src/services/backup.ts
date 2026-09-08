import { db } from '@/repositories/db'
import { installListsIfNeeded } from '@/repositories'
import { SCHEMA_VERSION } from '@/models/types'
import type {
  AppSettings,
  Category,
  Expense,
  Merchant,
  MonthBudget,
  RecurringExpense,
} from '@/models/types'

/**
 * Sauvegarde et restauration complètes, en JSON.
 *
 * Une PWA n'offre pas les mêmes garanties de conservation qu'une app native :
 * Safari peut effacer le stockage d'un site resté longtemps inutilisé, et
 * effacer les données de navigation emporte la base. **La sauvegarde JSON est
 * donc le vrai filet de sécurité**, pas une option de confort — l'app le dit
 * clairement dans ses réglages.
 *
 * Le fichier ne contient volontairement ni le code PIN ni le justificatif
 * WebAuthn : ils sont propres à l'appareil, et un secret n'a rien à faire dans
 * un fichier qu'on transfère.
 */

export interface BackupFile {
  /** Version du **format de sauvegarde**, indépendante du schéma. */
  version: number
  /** Version du schéma de données qui a produit ce fichier. */
  schemaVersion: number
  exportedAt: string
  app: 'budget-personnel'
  data: {
    expenses: Expense[]
    categories: Category[]
    merchants: Merchant[]
    recurring: RecurringExpense[]
    monthBudgets: MonthBudget[]
    settings: Omit<AppSettings, 'id'> | null
  }
}

export const BACKUP_FORMAT_VERSION = 1

export async function createBackup(): Promise<BackupFile> {
  const [expenses, categories, merchants, recurring, monthBudgets, settings] = await Promise.all([
    db.expenses.toArray(),
    db.categories.toArray(),
    db.merchants.toArray(),
    db.recurring.toArray(),
    db.monthBudgets.toArray(),
    db.settings.get('settings'),
  ])

  const { id: _id, ...settingsWithoutId } = settings ?? { id: 'settings' as const }

  return {
    version: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'budget-personnel',
    data: {
      expenses,
      categories,
      merchants,
      recurring,
      monthBudgets,
      settings: settings ? (settingsWithoutId as Omit<AppSettings, 'id'>) : null,
    },
  }
}

export interface BackupSummary {
  exportedAt: string
  schemaVersion: number
  expenses: number
  categories: number
  merchants: number
  recurring: number
  monthBudgets: number
}

export type ValidationResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: string }

/**
 * Valide un fichier avant toute écriture.
 *
 * Rien n'est importé tant que la structure n'a pas été vérifiée : un fichier
 * tronqué ou étranger ne doit jamais pouvoir remplacer des données réelles.
 */
export function validateBackup(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Le fichier ne contient pas de données lisibles.' }
  }

  const candidate = raw as Partial<BackupFile>

  if (candidate.app !== 'budget-personnel') {
    return {
      ok: false,
      error: 'Ce fichier ne provient pas de Budget Personnel.',
    }
  }

  if (typeof candidate.version !== 'number') {
    return { ok: false, error: 'Version de sauvegarde absente ou invalide.' }
  }

  if (candidate.version > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Cette sauvegarde vient d’une version plus récente de l’app (format ${candidate.version}). Mettez l’app à jour avant de l’importer.`,
    }
  }

  const data = candidate.data
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Le fichier ne contient aucune donnée.' }
  }

  const collections = ['expenses', 'categories', 'merchants', 'recurring', 'monthBudgets'] as const
  for (const key of collections) {
    if (!Array.isArray(data[key])) {
      return { ok: false, error: `Section « ${key} » absente ou invalide.` }
    }
  }

  // Contrôle de forme sur les dépenses : c'est la table qui compte vraiment.
  for (const expense of data.expenses) {
    if (
      typeof expense?.id !== 'string' ||
      typeof expense?.date !== 'string' ||
      typeof expense?.amount !== 'number' ||
      Number.isNaN(expense.amount)
    ) {
      return { ok: false, error: 'Au moins une dépense du fichier est incomplète.' }
    }
  }

  return {
    ok: true,
    backup: candidate as BackupFile,
    summary: {
      exportedAt: candidate.exportedAt ?? '',
      schemaVersion: candidate.schemaVersion ?? 1,
      expenses: data.expenses.length,
      categories: data.categories.length,
      merchants: data.merchants.length,
      recurring: data.recurring.length,
      monthBudgets: data.monthBudgets.length,
    },
  }
}

/**
 * Restaure une sauvegarde validée.
 *
 * Remplacement complet, dans une seule transaction : en cas d'échec en cours
 * de route, rien n'est écrit et les données existantes restent intactes.
 * Les réglages de sécurité de l'appareil (code, biométrie) ne sont pas
 * restaurés : ils appartiennent à l'appareil, pas à la sauvegarde.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const { data } = backup

  await db.transaction(
    'rw',
    [db.expenses, db.categories, db.merchants, db.recurring, db.monthBudgets, db.settings],
    async () => {
      await Promise.all([
        db.expenses.clear(),
        db.categories.clear(),
        db.merchants.clear(),
        db.recurring.clear(),
        db.monthBudgets.clear(),
      ])

      await db.expenses.bulkAdd(data.expenses)
      await db.categories.bulkAdd(data.categories)
      await db.merchants.bulkAdd(data.merchants)
      await db.recurring.bulkAdd(data.recurring)
      await db.monthBudgets.bulkAdd(data.monthBudgets)

      const current = await db.settings.get('settings')
      await db.settings.put({
        ...(current ?? { id: 'settings' as const }),
        ...(data.settings ?? {}),
        id: 'settings',
        schemaVersion: SCHEMA_VERSION,
        // Le verrouillage suit l'appareil : un code présent ici ne doit pas
        // être réactivé par un fichier venu d'ailleurs.
        lockEnabled: current?.lockEnabled ?? false,
        biometricsEnabled: current?.biometricsEnabled ?? false,
        demoSeeded: true,
      } as AppSettings)
    },
  )

  // Une sauvegarde sans listes laisserait l'app sans catégories.
  await installListsIfNeeded()
}

/** Nom de fichier daté, trié naturellement dans un dossier. */
export function backupFileName(date = new Date()): string {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
  return `budget-personnel-sauvegarde-${stamp}.json`
}
