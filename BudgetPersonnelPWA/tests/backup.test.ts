import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/repositories/db'
import { bootstrap } from '@/repositories'
import {
  BACKUP_FORMAT_VERSION,
  backupFileName,
  backupFreshness,
  createBackup,
  restoreBackup,
  validateBackup,
} from '@/services/backup'
import { buildCsv, csvFileName } from '@/services/csv'
import { SEED_CATEGORIES } from '@/data/seed'
import type { Category, Expense, Merchant } from '@/models/types'
import { DEFAULT_PROTECTED_FIELDS } from '@/models/types'

beforeEach(async () => {
  await Promise.all([
    db.expenses.clear(),
    db.categories.clear(),
    db.merchants.clear(),
    db.recurring.clear(),
    db.monthBudgets.clear(),
    db.settings.clear(),
  ])
})

describe('createBackup', () => {
  it('embarque toutes les collections et les versions', async () => {
    await bootstrap(new Date(2026, 8, 15))
    const backup = await createBackup()

    expect(backup.app).toBe('budget-personnel')
    expect(backup.version).toBe(BACKUP_FORMAT_VERSION)
    expect(backup.schemaVersion).toBe(1)
    expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(backup.data.categories.length).toBe(SEED_CATEGORIES.length)
    expect(backup.data.expenses.length).toBeGreaterThan(0)
  })

  it('reste sérialisable en JSON', async () => {
    await bootstrap(new Date(2026, 8, 15))
    const roundTrip = JSON.parse(JSON.stringify(await createBackup()))
    expect(validateBackup(roundTrip).ok).toBe(true)
  })
})

describe('validateBackup', () => {
  const valid = {
    app: 'budget-personnel',
    version: 1,
    schemaVersion: 1,
    exportedAt: '2026-09-08T10:00:00.000Z',
    data: {
      expenses: [],
      categories: [],
      merchants: [],
      recurring: [],
      monthBudgets: [],
      settings: null,
    },
  }

  it('accepte un fichier conforme', () => {
    const result = validateBackup(valid)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.summary.expenses).toBe(0)
  })

  it('refuse ce qui n’est pas un objet', () => {
    expect(validateBackup(null).ok).toBe(false)
    expect(validateBackup('texte').ok).toBe(false)
  })

  it('refuse un fichier d’une autre application', () => {
    expect(validateBackup({ ...valid, app: 'autre-app' }).ok).toBe(false)
  })

  it('refuse une version de format plus récente que l’app', () => {
    const result = validateBackup({ ...valid, version: BACKUP_FORMAT_VERSION + 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('plus récente')
  })

  it('refuse une section manquante', () => {
    const broken = { ...valid, data: { ...valid.data, expenses: undefined } }
    expect(validateBackup(broken).ok).toBe(false)
  })

  it('refuse une dépense au montant invalide', () => {
    const broken = {
      ...valid,
      data: {
        ...valid.data,
        expenses: [{ id: 'e1', date: '2026-01-01', amount: 'beaucoup' }],
      },
    }
    expect(validateBackup(broken).ok).toBe(false)
  })

  it('résume le contenu pour la confirmation', () => {
    const result = validateBackup({
      ...valid,
      data: {
        ...valid.data,
        expenses: [{ id: 'e1', date: '2026-01-01', amount: 12 }],
        categories: [{ id: 'c1', name: 'A', icon: 'tag', sortOrder: 0 }],
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.summary.expenses).toBe(1)
      expect(result.summary.categories).toBe(1)
    }
  })
})

describe('restoreBackup', () => {
  it('remplace intégralement les données existantes', async () => {
    await bootstrap(new Date(2026, 8, 15))
    const before = await db.expenses.count()
    expect(before).toBeGreaterThan(0)

    await restoreBackup({
      app: 'budget-personnel',
      version: 1,
      schemaVersion: 1,
      exportedAt: '2026-09-08T10:00:00.000Z',
      data: {
        expenses: [
          {
            id: 'imported-1',
            date: '2026-07-04',
            monthKey: '2026-07',
            categoryId: 'cat-x',
            merchantId: '',
            description: 'Importée',
            amount: 99,
            type: 'variable',
            plannedAmount: null,
            status: 'paye',
            note: '',
            confidential: false,
            recurringId: null,
            createdAt: '2026-07-04T00:00:00.000Z',
            updatedAt: '2026-07-04T00:00:00.000Z',
          },
        ],
        categories: [{ id: 'cat-x', name: 'Importée', icon: 'tag', sortOrder: 0 }],
        merchants: [],
        recurring: [],
        monthBudgets: [],
        settings: null,
      },
    })

    const rows = await db.expenses.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Importée')
  })

  it('ne réactive pas le verrouillage depuis un fichier importé', async () => {
    await bootstrap(new Date(2026, 8, 15))
    await db.settings.put({
      id: 'settings',
      schemaVersion: 1,
      theme: 'system',
      lockEnabled: false,
      biometricsEnabled: false,
      pinLength: 6,
      protectedFields: DEFAULT_PROTECTED_FIELDS,
      unlockDuration: 'background',
      keepReceiptImages: true,
      lastBackupAt: null,
      demoSeeded: true,
    })

    await restoreBackup({
      app: 'budget-personnel',
      version: 1,
      schemaVersion: 1,
      exportedAt: '2026-09-08T10:00:00.000Z',
      data: {
        expenses: [],
        categories: [],
        merchants: [],
        recurring: [],
        monthBudgets: [],
        // Le fichier prétend que le verrouillage était actif.
        settings: {
          schemaVersion: 1,
          theme: 'dark',
          lockEnabled: true,
          biometricsEnabled: true,
          pinLength: 6,
          protectedFields: DEFAULT_PROTECTED_FIELDS,
          unlockDuration: 'background',
          demoSeeded: true,
        },
      },
    })

    const settings = await db.settings.get('settings')
    // Le code vit sur l'appareil : un fichier ne doit pas pouvoir le rallumer.
    expect(settings?.lockEnabled).toBe(false)
    expect(settings?.biometricsEnabled).toBe(false)
    // Les préférences d'affichage, elles, sont bien restaurées.
    expect(settings?.theme).toBe('dark')
  })

  it('restaure les listes par défaut si la sauvegarde n’en contient pas', async () => {
    await restoreBackup({
      app: 'budget-personnel',
      version: 1,
      schemaVersion: 1,
      exportedAt: '2026-09-08T10:00:00.000Z',
      data: {
        expenses: [],
        categories: [],
        merchants: [],
        recurring: [],
        monthBudgets: [],
        settings: null,
      },
    })

    expect(await db.categories.count()).toBe(SEED_CATEGORIES.length)
  })
})

describe('export CSV', () => {
  const categories: Category[] = [{ id: 'c1', name: 'Courses', icon: 'cart', sortOrder: 0 }]
  const merchants: Merchant[] = [{ id: 'm1', name: 'Lidl', sortOrder: 0 }]

  const expense = (patch: Partial<Expense> = {}): Expense => ({
    id: 'e1',
    date: '2026-09-12',
    monthKey: '2026-09',
    categoryId: 'c1',
    merchantId: 'm1',
    description: 'Courses',
    amount: 42.5,
    type: 'variable',
    plannedAmount: null,
    status: 'paye',
    note: '',
    confidential: false,
    recurringId: null,
    createdAt: '2026-09-12T08:00:00.000Z',
    updatedAt: '2026-09-12T08:00:00.000Z',
    ...patch,
  })

  it('produit un en-tête et des points-virgules', () => {
    const csv = buildCsv({
      expenses: [expense()],
      categories,
      merchants,
      includeConfidential: true,
    })
    const [header, row] = csv.split('\r\n')

    expect(header.startsWith('Date;Catégorie;Enseigne')).toBe(true)
    expect(row).toContain('Courses;Lidl')
  })

  it('écrit les décimales à la française', () => {
    const csv = buildCsv({
      expenses: [expense({ amount: 42.5 })],
      categories,
      merchants,
      includeConfidential: true,
    })
    expect(csv).toContain('42,50')
    expect(csv).not.toContain('42.50')
  })

  it('calcule l’écart réel − prévu', () => {
    const csv = buildCsv({
      expenses: [expense({ amount: 120, plannedAmount: 100 })],
      categories,
      merchants,
      includeConfidential: true,
    })
    expect(csv).toContain('100,00;20,00')
  })

  it('peut exclure les dépenses confidentielles', () => {
    const rows = [expense({ id: 'a' }), expense({ id: 'b', confidential: true, description: 'Secret' })]

    expect(
      buildCsv({ expenses: rows, categories, merchants, includeConfidential: true }),
    ).toContain('Secret')
    expect(
      buildCsv({ expenses: rows, categories, merchants, includeConfidential: false }),
    ).not.toContain('Secret')
  })

  it('échappe les champs contenant un point-virgule', () => {
    const csv = buildCsv({
      expenses: [expense({ note: 'Courses; puis essence' })],
      categories,
      merchants,
      includeConfidential: true,
    })
    expect(csv).toContain('"Courses; puis essence"')
  })

  it('trie par date croissante', () => {
    const csv = buildCsv({
      expenses: [
        expense({ id: 'b', date: '2026-09-20', description: 'Deuxième' }),
        expense({ id: 'a', date: '2026-09-05', description: 'Première' }),
      ],
      categories,
      merchants,
      includeConfidential: true,
    })
    const lines = csv.split('\r\n')
    expect(lines[1]).toContain('Première')
    expect(lines[2]).toContain('Deuxième')
  })
})

describe('noms de fichiers', () => {
  it('datent le fichier au jour local', () => {
    const date = new Date(2026, 8, 8)
    expect(backupFileName(date)).toBe('budget-personnel-sauvegarde-2026-09-08.json')
    expect(csvFileName(date)).toBe('budget-personnel-2026-09-08.csv')
  })
})

// La sauvegarde est la seule protection contre la perte totale : la règle qui
// décide s'il faut la réclamer mérite d'être vérifiée pour elle-même.
describe('backupFreshness', () => {
  const now = new Date('2026-09-10T12:00:00.000Z')

  it('ne réclame rien tant qu’aucune dépense n’a été saisie', () => {
    expect(backupFreshness(null, 0, now)).toEqual({ state: 'fresh', days: null })
  })

  it('signale l’absence totale de sauvegarde dès qu’il y a des données', () => {
    expect(backupFreshness(null, 3, now)).toEqual({ state: 'never', days: null })
  })

  it('reste sereine juste avant le seuil', () => {
    const recent = new Date('2026-08-13T12:00:00.000Z').toISOString() // 28 jours
    expect(backupFreshness(recent, 3, now)).toEqual({ state: 'fresh', days: 28 })
  })

  it('alerte à partir du seuil', () => {
    const old = new Date('2026-08-11T12:00:00.000Z').toISOString() // 30 jours
    expect(backupFreshness(old, 3, now)).toEqual({ state: 'stale', days: 30 })
  })

  it('compte zéro jour pour une sauvegarde du jour', () => {
    expect(backupFreshness(now.toISOString(), 3, now)).toEqual({ state: 'fresh', days: 0 })
  })

  // Une date illisible ne doit pas passer pour une sauvegarde valide : mieux
  // vaut réclamer un export de trop qu'en laisser manquer un.
  it('traite une date illisible comme une absence de sauvegarde', () => {
    expect(backupFreshness('pas-une-date', 3, now)).toEqual({ state: 'never', days: null })
  })

  it('ne rend jamais un nombre de jours négatif', () => {
    const future = new Date('2026-09-20T12:00:00.000Z').toISOString()
    expect(backupFreshness(future, 3, now).days).toBe(0)
  })
})
