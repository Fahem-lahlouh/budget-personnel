import { beforeEach, describe, expect, it } from 'vitest'
import { BudgetDatabase, db } from '@/repositories/db'
import {
  bootstrap,
  categoryRepository,
  expenseRepository,
  installDemoData,
  merchantRepository,
  monthBudgetRepository,
  recurringRepository,
  resetToDemoData,
  settingsRepository,
  wipeAllData,
} from '@/repositories'
import { SEED_CATEGORIES, SEED_MERCHANTS, SEED_RECURRING } from '@/data/seed'

/** Base vierge avant chaque test : les cas restent indépendants. */
async function reset() {
  await Promise.all([
    db.expenses.clear(),
    db.categories.clear(),
    db.merchants.clear(),
    db.recurring.clear(),
    db.monthBudgets.clear(),
    db.settings.clear(),
    db.credentials.clear(),
  ])
}

beforeEach(reset)

describe('amorçage', () => {
  it('installe listes et démonstration au premier lancement', async () => {
    const settings = await bootstrap(new Date(2026, 8, 15))

    expect(await db.categories.count()).toBe(SEED_CATEGORIES.length)
    expect(await db.merchants.count()).toBe(SEED_MERCHANTS.length)
    expect(await db.recurring.count()).toBe(SEED_RECURRING.length)
    expect(await db.expenses.count()).toBeGreaterThan(0)
    expect(settings.demoSeeded).toBe(true)
  })

  it('ne réinjecte pas la démonstration au lancement suivant', async () => {
    await bootstrap(new Date(2026, 8, 15))
    await db.expenses.clear()

    await bootstrap(new Date(2026, 8, 15))

    // L'utilisateur a effacé ses dépenses : elles ne doivent pas revenir.
    expect(await db.expenses.count()).toBe(0)
  })

  it('replace la démonstration sur le mois de référence', async () => {
    await installDemoData(new Date(2026, 2, 10))
    const rows = await db.expenses.toArray()

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.monthKey === '2026-03')).toBe(true)
  })

  it('borne le jour au dernier du mois court', async () => {
    // Le 31 n'existe pas en février : la démo ne doit pas produire de date
    // invalide comme 2026-02-31.
    await installDemoData(new Date(2026, 1, 5))
    const rows = await db.expenses.toArray()
    expect(rows.every((row) => Number(row.date.slice(8)) <= 28)).toBe(true)
  })
})

describe('expenseRepository', () => {
  it('dérive monthKey de la date à la création', async () => {
    const created = await expenseRepository.create({
      date: '2026-04-17',
      categoryId: 'cat-courses',
      merchantId: '',
      description: 'Test',
      amount: 42,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })

    expect(created.monthKey).toBe('2026-04')
    expect(created.id).toMatch(/^exp-/)
  })

  it('recalcule monthKey quand la date change de mois', async () => {
    const created = await expenseRepository.create({
      date: '2026-04-17',
      categoryId: 'c',
      merchantId: '',
      description: '',
      amount: 10,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })

    await expenseRepository.update(created.id, { date: '2026-05-02' })
    const updated = await expenseRepository.get(created.id)

    // Sans recalcul, la dépense resterait indexée sur avril et disparaîtrait
    // du mois de mai.
    expect(updated?.monthKey).toBe('2026-05')
  })

  it('ne renvoie que le mois demandé', async () => {
    for (const date of ['2026-01-05', '2026-02-05', '2026-02-20']) {
      await expenseRepository.create({
        date,
        categoryId: 'c',
        merchantId: '',
        description: '',
        amount: 10,
        type: 'variable',
        plannedAmount: null,
        status: 'paye',
        note: '',
        confidential: false,
        recurringId: null,
      })
    }

    expect(await expenseRepository.forMonth(2026, 2)).toHaveLength(2)
    expect(await expenseRepository.forYear(2026)).toHaveLength(3)
    expect(await expenseRepository.forYear(2025)).toHaveLength(0)
  })

  it('trie du plus récent au plus ancien', async () => {
    for (const date of ['2026-03-01', '2026-03-25', '2026-03-10']) {
      await expenseRepository.create({
        date,
        categoryId: 'c',
        merchantId: '',
        description: date,
        amount: 10,
        type: 'variable',
        plannedAmount: null,
        status: 'paye',
        note: '',
        confidential: false,
        recurringId: null,
      })
    }

    const rows = await expenseRepository.forMonth(2026, 3)
    expect(rows.map((row) => row.date)).toEqual(['2026-03-25', '2026-03-10', '2026-03-01'])
  })

  it('supprime une dépense', async () => {
    const created = await expenseRepository.create({
      date: '2026-06-01',
      categoryId: 'c',
      merchantId: '',
      description: '',
      amount: 5,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })

    await expenseRepository.remove(created.id)
    expect(await expenseRepository.get(created.id)).toBeUndefined()
  })
})

describe('categoryRepository — le renommage préserve l’historique', () => {
  it('ne touche pas aux dépenses quand une catégorie est renommée', async () => {
    const category = await categoryRepository.create('Courses')
    const expense = await expenseRepository.create({
      date: '2026-05-05',
      categoryId: category.id,
      merchantId: '',
      description: 'Panier',
      amount: 30,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })

    await categoryRepository.rename(category.id, 'Alimentation')

    const reloaded = await expenseRepository.get(expense.id)
    // Le lien se fait par identifiant : rien à réécrire côté dépenses.
    expect(reloaded?.categoryId).toBe(category.id)
    expect((await db.categories.get(category.id))?.name).toBe('Alimentation')
  })

  it('compte les dépenses rattachées avant suppression', async () => {
    const category = await categoryRepository.create('Loisirs')
    await expenseRepository.create({
      date: '2026-05-05',
      categoryId: category.id,
      merchantId: '',
      description: '',
      amount: 12,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })

    expect(await categoryRepository.usageCount(category.id)).toBe(1)
  })

  it('réordonne selon la liste fournie', async () => {
    const a = await categoryRepository.create('A')
    const b = await categoryRepository.create('B')
    const c = await categoryRepository.create('C')

    await categoryRepository.reorder([c.id, a.id, b.id])

    expect((await categoryRepository.all()).map((item) => item.name)).toEqual(['C', 'A', 'B'])
  })

  it('incrémente sortOrder à chaque ajout', async () => {
    await categoryRepository.create('Un')
    const second = await categoryRepository.create('Deux')
    expect(second.sortOrder).toBe(1)
  })
})

describe('merchantRepository', () => {
  it('crée, renomme et supprime', async () => {
    const merchant = await merchantRepository.create('Lidl')
    await merchantRepository.rename(merchant.id, 'Aldi')
    expect((await merchantRepository.all())[0].name).toBe('Aldi')

    await merchantRepository.remove(merchant.id)
    expect(await merchantRepository.all()).toHaveLength(0)
  })
})

describe('monthBudgetRepository', () => {
  it('enregistre et relit un budget mensuel', async () => {
    await monthBudgetRepository.set(2026, 9, 3000, 300)
    const budget = await monthBudgetRepository.get(2026, 9)

    expect(budget?.salary).toBe(3000)
    expect(budget?.id).toBe('2026-09')
  })

  it('écrase le budget d’un mois déjà renseigné', async () => {
    await monthBudgetRepository.set(2026, 9, 3000, 300)
    await monthBudgetRepository.set(2026, 9, 3200, 400)

    expect(await monthBudgetRepository.forYear(2026)).toHaveLength(1)
    expect((await monthBudgetRepository.get(2026, 9))?.salary).toBe(3200)
  })

  it('retrouve le dernier mois renseigné avant celui demandé', async () => {
    await monthBudgetRepository.set(2026, 1, 2800, 200)
    await monthBudgetRepository.set(2026, 5, 3000, 300)

    const previous = await monthBudgetRepository.latestBefore(2026, 9)
    expect(previous?.month).toBe(5)
  })

  it('ignore les mois à salaire nul pour la reprise', async () => {
    await monthBudgetRepository.set(2026, 3, 0, 0)
    expect(await monthBudgetRepository.latestBefore(2026, 9)).toBeUndefined()
  })
})

describe('recurringRepository', () => {
  it('trie par jour du mois', async () => {
    await recurringRepository.create({
      categoryId: 'c', merchantId: '', description: 'Tard', plannedAmount: 10,
      dayOfMonth: 25, type: 'fixe', note: '', confidential: false, active: true,
    })
    await recurringRepository.create({
      categoryId: 'c', merchantId: '', description: 'Tôt', plannedAmount: 10,
      dayOfMonth: 3, type: 'fixe', note: '', confidential: false, active: true,
    })

    expect((await recurringRepository.all()).map((r) => r.description)).toEqual(['Tôt', 'Tard'])
  })

  it('désactive sans supprimer', async () => {
    const created = await recurringRepository.create({
      categoryId: 'c', merchantId: '', description: 'Abonnement', plannedAmount: 10,
      dayOfMonth: 3, type: 'fixe', note: '', confidential: false, active: true,
    })

    await recurringRepository.update(created.id, { active: false })
    const all = await recurringRepository.all()

    expect(all).toHaveLength(1)
    expect(all[0].active).toBe(false)
  })
})

describe('effacement et réinitialisation', () => {
  it('efface les données mais restaure les listes par défaut', async () => {
    await bootstrap(new Date(2026, 8, 15))
    await wipeAllData()

    expect(await db.expenses.count()).toBe(0)
    expect(await db.recurring.count()).toBe(0)
    expect(await db.monthBudgets.count()).toBe(0)
    // Sans catégories, l'app serait inutilisable : elles reviennent.
    expect(await db.categories.count()).toBe(SEED_CATEGORIES.length)
  })

  it('recharge la démonstration à la demande', async () => {
    await bootstrap(new Date(2026, 8, 15))
    await db.expenses.clear()

    await resetToDemoData(new Date(2026, 8, 15))

    expect(await db.expenses.count()).toBeGreaterThan(0)
    expect(await db.recurring.count()).toBe(SEED_RECURRING.length)
  })
})

describe('settingsRepository', () => {
  it('crée les réglages par défaut à la première lecture', async () => {
    const settings = await settingsRepository.get()
    expect(settings.theme).toBe('system')
    expect(settings.lockEnabled).toBe(false)
    expect(settings.schemaVersion).toBe(1)
  })

  it('conserve les valeurs non modifiées lors d’une mise à jour partielle', async () => {
    await settingsRepository.update({ theme: 'dark' })
    const settings = await settingsRepository.update({ lockEnabled: true })

    expect(settings.theme).toBe('dark')
    expect(settings.lockEnabled).toBe(true)
  })
})

describe('schéma', () => {
  it('déclare monthKey comme index des dépenses', async () => {
    const fresh = new BudgetDatabase('schema-check')
    await fresh.open()
    const indexes = fresh.expenses.schema.indexes.map((index) => index.name)
    expect(indexes).toContain('monthKey')
    fresh.close()
  })
})
