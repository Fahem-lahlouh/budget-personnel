import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/repositories/db'
import { pinService } from '@/services/crypto'
import { DEFAULT_PROTECTED_FIELDS } from '@/models/types'

/**
 * La logique de révélation par champ (`UnlockSession`) vit dans un composant
 * React et n'est pas testée ici en isolation — elle est un pur graphe d'état
 * React sans branchement métier. Ce fichier couvre ce qui *est* de la
 * logique pure : le service de code PIN (partagé par le verrouillage global
 * et la révélation par champ) et les valeurs par défaut de confidentialité.
 */

beforeEach(async () => {
  await db.credentials.clear()
})

describe('pinService — code correct / incorrect', () => {
  it('vérifie un code correct', async () => {
    await pinService.setPin('123456')
    expect(await pinService.verify('123456')).toBe(true)
  })

  it('rejette un code incorrect', async () => {
    await pinService.setPin('123456')
    expect(await pinService.verify('654321')).toBe(false)
  })

  it('accepte un code à 4 chiffres aussi bien qu’à 6', async () => {
    await pinService.setPin('4242')
    expect(await pinService.verify('4242')).toBe(true)
    expect(await pinService.verify('42420')).toBe(false)
  })

  it('remplace l’ancien code lors d’un changement', async () => {
    await pinService.setPin('111111')
    await pinService.setPin('222222')
    expect(await pinService.verify('111111')).toBe(false)
    expect(await pinService.verify('222222')).toBe(true)
  })

  it('ne vérifie jamais rien sans code configuré', async () => {
    expect(await pinService.isConfigured()).toBe(false)
    expect(await pinService.verify('123456')).toBe(false)
  })

  it('efface le code', async () => {
    await pinService.setPin('123456')
    await pinService.clear()
    expect(await pinService.isConfigured()).toBe(false)
  })
})

describe('DEFAULT_PROTECTED_FIELDS', () => {
  it('protège tout sauf les pourcentages, par défaut', () => {
    expect(DEFAULT_PROTECTED_FIELDS.salary).toBe(true)
    expect(DEFAULT_PROTECTED_FIELDS.remaining).toBe(true)
    expect(DEFAULT_PROTECTED_FIELDS.realSavings).toBe(true)
    expect(DEFAULT_PROTECTED_FIELDS.totalSpent).toBe(true)
    expect(DEFAULT_PROTECTED_FIELDS.budgetGoal).toBe(true)
    expect(DEFAULT_PROTECTED_FIELDS.expenseAmounts).toBe(true)
    expect(DEFAULT_PROTECTED_FIELDS.confidentialExpenses).toBe(true)
    expect(DEFAULT_PROTECTED_FIELDS.percentages).toBe(false)
  })
})
