import { describe, expect, it, beforeEach } from 'vitest'
import { parseReceipt } from '@/services/ocr/receiptParser'
import { buildSearchIndex, itemsTotal } from '@/models/receipt'
import { db } from '@/repositories/db'
import {
  bootstrap,
  expenseRepository,
  receiptRepository,
  receiptImageRepository,
} from '@/repositories'
import { createBackup, restoreBackup, validateBackup } from '@/services/backup'

const TICKET_SIMPLE = ['AUCHAN', 'COCA COLA 2,15 €', 'LAIT 1,08 €', 'BANANES 2,34 €', 'TOTAL 5,57 €'].join(
  '\n',
)

const TICKET_COMPLET = [
  'CARREFOUR MARKET',
  '12 RUE DE PARIS',
  '92700 COLOMBES',
  'TEL 01 47 80 00 00',
  '',
  'COCA COLA 1.5L 2,15 B',
  'LAIT DEMI ECREME 1,08 A',
  '2 x 1,17',
  'BANANES 2,34 A',
  'PAIN COMPLET 1,20 A',
  '',
  'SOUS-TOTAL 6,77',
  'TOTAL 6,77 €',
  'CARTE BANCAIRE 6,77',
  'TVA 5,5% 0,35',
  'NB ARTICLES 4',
  '12/09/2026 15:07',
  'MERCI DE VOTRE VISITE',
].join('\n')

describe('parseReceipt — enseigne, date, total', () => {
  it('lit l’exemple minimal', () => {
    const receipt = parseReceipt(TICKET_SIMPLE, 2026)
    expect(receipt.merchantName).toBe('AUCHAN')
    expect(receipt.total).toBe(5.57)
    expect(receipt.items.map((item) => [item.label, item.totalPrice])).toEqual([
      ['COCA COLA', 2.15],
      ['LAIT', 1.08],
      ['BANANES', 2.34],
    ])
  })

  it('retient l’enseigne et non l’adresse qui la suit', () => {
    expect(parseReceipt(TICKET_COMPLET, 2026).merchantName).toBe('CARREFOUR MARKET')
  })

  it('lit la date du ticket', () => {
    expect(parseReceipt(TICKET_COMPLET, 2026).purchasedAt).toBe('2026-09-12')
  })

  it('accepte les dates écrites avec des points ou des tirets', () => {
    expect(parseReceipt('LIDL\nPAIN 1,20\n05.03.2026', 2026).purchasedAt).toBe('2026-03-05')
    expect(parseReceipt('LIDL\nPAIN 1,20\n05-03-2026', 2026).purchasedAt).toBe('2026-03-05')
  })

  it('préfère le total au sous-total', () => {
    expect(parseReceipt(TICKET_COMPLET, 2026).total).toBe(6.77)
  })

  it('ne rend aucun total quand le ticket n’en annonce pas', () => {
    expect(parseReceipt('AUCHAN\nPAIN 1,20', 2026).total).toBeNull()
  })
})

describe('parseReceipt — articles', () => {
  it('écarte le pied de ticket : paiement, TVA, comptage', () => {
    const labels = parseReceipt(TICKET_COMPLET, 2026).items.map((item) => item.label)
    expect(labels).toEqual(['COCA COLA 1.5L', 'LAIT DEMI ECREME', 'BANANES', 'PAIN COMPLET'])
    expect(labels.some((label) => /carte|tva|articles/i.test(label))).toBe(false)
  })

  it('rattache une quantité écrite sur la ligne précédente', () => {
    const bananes = parseReceipt(TICKET_COMPLET, 2026).items.find((i) => i.label === 'BANANES')
    expect(bananes?.quantity).toBe(2)
    expect(bananes?.unitPrice).toBe(1.17)
  })

  it('lit une quantité écrite sur la ligne de l’article', () => {
    const [item] = parseReceipt('AUCHAN\nYAOURTS 4 x 0,75 3,00', 2026).items
    expect(item.quantity).toBe(4)
    expect(item.unitPrice).toBe(0.75)
    expect(item.totalPrice).toBe(3)
    // L'expression de quantité ne doit pas rester collée au libellé.
    expect(item.label).toBe('YAOURTS')
  })

  it('ne prend pas un code article sans décimales pour un prix', () => {
    expect(parseReceipt('AUCHAN\nREF 3245678901234', 2026).items).toHaveLength(0)
  })

  it('garde une remise négative telle quelle', () => {
    const [item] = parseReceipt('AUCHAN\nREMISE PROMO -0,50', 2026).items
    expect(item.totalPrice).toBe(-0.5)
  })

  it('rend un ticket vide plutôt que d’inventer', () => {
    const receipt = parseReceipt('', 2026)
    expect(receipt.merchantName).toBeNull()
    expect(receipt.total).toBeNull()
    expect(receipt.items).toEqual([])
  })
})

describe('modèle Receipt', () => {
  it('somme les lignes', () => {
    expect(itemsTotal([{ totalPrice: 2.15 }, { totalPrice: 1.08 }])).toBeCloseTo(3.23)
  })

  it('construit un index de recherche en minuscules', () => {
    const index = buildSearchIndex('Auchan', [
      { id: '1', label: 'Coca-Cola', quantity: null, unitPrice: null, totalPrice: 2.15 },
    ])
    expect(index).toContain('coca-cola')
    expect(index).toContain('auchan')
  })
})

describe('receiptRepository', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrap(new Date(2026, 8, 15))
  })

  async function makeExpense() {
    const [category] = await db.categories.toArray()
    return expenseRepository.create({
      date: '2026-09-12',
      categoryId: category.id,
      merchantId: '',
      description: 'Auchan',
      amount: 5.57,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })
  }

  it('rattache un ticket à sa dépense et indexe ses articles', async () => {
    const expense = await makeExpense()
    await receiptRepository.create({
      expenseId: expense.id,
      merchantName: 'Auchan',
      purchasedAt: '2026-09-12',
      total: 5.57,
      items: [{ label: 'Coca-Cola', quantity: null, unitPrice: null, totalPrice: 2.15 }],
      rawText: 'AUCHAN',
      image: null,
    })

    const found = await receiptRepository.forExpense(expense.id)
    expect(found?.items).toHaveLength(1)
    expect(found?.items[0].id).toBeTruthy()
    expect(found?.searchIndex).toContain('coca-cola')
    expect(found?.hasImage).toBe(false)
  })

  it('conserve la photo à part et signale sa présence', async () => {
    const expense = await makeExpense()
    const receipt = await receiptRepository.create({
      expenseId: expense.id,
      merchantName: 'Auchan',
      purchasedAt: '2026-09-12',
      total: 5.57,
      items: [],
      rawText: '',
      image: new Blob(['photo'], { type: 'image/jpeg' }),
    })

    expect(receipt.hasImage).toBe(true)
    const image = await receiptImageRepository.get(receipt.id)
    expect(image?.byteSize).toBe(5)
    expect(await receiptImageRepository.count()).toBe(1)
  })

  // Un ticket ne survit pas à la dépense qu'il documente : sans cascade, il
  // resterait en base à jamais, invisible et pourtant compté dans l'espace.
  it('supprime le ticket et sa photo avec la dépense', async () => {
    const expense = await makeExpense()
    await receiptRepository.create({
      expenseId: expense.id,
      merchantName: 'Auchan',
      purchasedAt: '2026-09-12',
      total: 5.57,
      items: [],
      rawText: '',
      image: new Blob(['photo'], { type: 'image/jpeg' }),
    })

    await expenseRepository.remove(expense.id)

    expect(await receiptRepository.forExpense(expense.id)).toBeUndefined()
    expect(await receiptImageRepository.count()).toBe(0)
  })

  it('supprime les photos sans perdre le détail des articles', async () => {
    const expense = await makeExpense()
    await receiptRepository.create({
      expenseId: expense.id,
      merchantName: 'Auchan',
      purchasedAt: '2026-09-12',
      total: 5.57,
      items: [{ label: 'Coca-Cola', quantity: null, unitPrice: null, totalPrice: 2.15 }],
      rawText: '',
      image: new Blob(['photo'], { type: 'image/jpeg' }),
    })

    await receiptImageRepository.removeAll()

    const found = await receiptRepository.forExpense(expense.id)
    expect(found?.items).toHaveLength(1)
    expect(found?.hasImage).toBe(false)
    expect(await receiptImageRepository.count()).toBe(0)
  })
})

describe('sauvegarde et tickets', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrap(new Date(2026, 8, 15))
  })

  it('emporte les tickets, sans leurs photos', async () => {
    const [category] = await db.categories.toArray()
    const expense = await expenseRepository.create({
      date: '2026-09-12',
      categoryId: category.id,
      merchantId: '',
      description: 'Auchan',
      amount: 5.57,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })
    await receiptRepository.create({
      expenseId: expense.id,
      merchantName: 'Auchan',
      purchasedAt: '2026-09-12',
      total: 5.57,
      items: [{ label: 'Coca-Cola', quantity: null, unitPrice: null, totalPrice: 2.15 }],
      rawText: 'AUCHAN',
      image: new Blob(['photo'], { type: 'image/jpeg' }),
    })

    const backup = await createBackup()
    expect(backup.data.receipts).toHaveLength(1)
    // La photo reste sur l'appareil : le JSON ne la transporte pas.
    expect(backup.data.receipts?.[0].hasImage).toBe(false)
    expect(JSON.stringify(backup)).not.toContain('blob')
  })

  // Un fichier écrit avant l'arrivée des tickets n'a pas la section : il doit
  // se restaurer sans erreur plutôt que d'être refusé.
  it('restaure une sauvegarde antérieure aux tickets', async () => {
    const backup = await createBackup()
    delete backup.data.receipts

    const result = validateBackup(JSON.parse(JSON.stringify(backup)))
    expect(result.ok).toBe(true)

    await expect(restoreBackup(backup)).resolves.toBeUndefined()
    expect(await db.receipts.count()).toBe(0)
  })
})

// Le « Annuler » proposé après une suppression n'a de valeur que s'il rend
// exactement ce qui a été retiré : la dépense, son ticket et sa photo, sous
// leurs identifiants d'origine — sinon les liens se défont en silence.
describe('annulation d’une suppression de dépense', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await bootstrap(new Date(2026, 8, 15))
  })

  async function makeExpenseWithReceipt() {
    const [category] = await db.categories.toArray()
    const expense = await expenseRepository.create({
      date: '2026-09-12',
      categoryId: category.id,
      merchantId: '',
      description: 'Auchan',
      amount: 5.57,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })
    const receipt = await receiptRepository.create({
      expenseId: expense.id,
      merchantName: 'Auchan',
      purchasedAt: '2026-09-12',
      total: 5.57,
      items: [{ label: 'Coca-Cola', quantity: null, unitPrice: null, totalPrice: 2.15 }],
      rawText: 'AUCHAN',
      image: new Blob(['photo'], { type: 'image/jpeg' }),
    })
    return { expense, receipt }
  }

  it('rend de quoi restaurer ce qui vient d’être supprimé', async () => {
    const { expense, receipt } = await makeExpenseWithReceipt()

    const deleted = await expenseRepository.remove(expense.id)

    expect(deleted?.expense.id).toBe(expense.id)
    expect(deleted?.receipt?.id).toBe(receipt.id)
    expect(deleted?.image?.byteSize).toBe(5)
  })

  it('remet la dépense, son ticket et sa photo sous les mêmes identifiants', async () => {
    const { expense, receipt } = await makeExpenseWithReceipt()
    const deleted = await expenseRepository.remove(expense.id)
    expect(await expenseRepository.get(expense.id)).toBeUndefined()

    await expenseRepository.restore(deleted!)

    const restored = await expenseRepository.get(expense.id)
    expect(restored).toEqual(expense)

    const restoredReceipt = await receiptRepository.forExpense(expense.id)
    expect(restoredReceipt?.id).toBe(receipt.id)
    expect(restoredReceipt?.items[0].label).toBe('Coca-Cola')
    expect(await receiptImageRepository.count()).toBe(1)
  })

  it('reste sans effet sur une dépense déjà absente', async () => {
    expect(await expenseRepository.remove('exp-inexistante')).toBeNull()
  })

  it('restaure une dépense qui n’avait pas de ticket', async () => {
    const [category] = await db.categories.toArray()
    const expense = await expenseRepository.create({
      date: '2026-09-12',
      categoryId: category.id,
      merchantId: '',
      description: 'Sans ticket',
      amount: 12,
      type: 'variable',
      plannedAmount: null,
      status: 'paye',
      note: '',
      confidential: false,
      recurringId: null,
    })

    const deleted = await expenseRepository.remove(expense.id)
    expect(deleted?.receipt).toBeNull()
    await expenseRepository.restore(deleted!)

    expect(await expenseRepository.get(expense.id)).toEqual(expense)
    expect(await db.receipts.count()).toBe(0)
  })
})
