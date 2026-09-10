import { describe, expect, it } from 'vitest'
import { parseFrenchAmount, parseFrenchDate } from '@/services/ocr/amountParser'
import { normalizeMerchantLabel, brandKey } from '@/services/ocr/merchantNormalizer'
import { parseStatementLine, parseStatementText } from '@/services/ocr/transactionParser'
import { computeFingerprint } from '@/services/ocr/fingerprint'
import { buildExistingFingerprints, isDuplicateFingerprint } from '@/services/ocr/duplicateDetector'
import { proposeCategorization } from '@/services/ocr/categorizationEngine'
import type { CategorizationRule, MerchantAlias } from '@/models/import'
import type { Expense, Merchant } from '@/models/types'

describe('parseFrenchAmount', () => {
  it('lit un montant simple avec virgule décimale', () => {
    expect(parseFrenchAmount('25,90')).toEqual({ value: 25.9, sign: 0 })
  })

  it('lit un montant avec séparateur de milliers et symbole €', () => {
    expect(parseFrenchAmount('1 234,56 €')).toEqual({ value: 1234.56, sign: 0 })
  })

  it('reconnaît un signe négatif en préfixe', () => {
    expect(parseFrenchAmount('-42,00')).toEqual({ value: 42, sign: -1 })
  })

  it('reconnaît un signe négatif en suffixe', () => {
    expect(parseFrenchAmount('42,00-')).toEqual({ value: 42, sign: -1 })
  })

  it('reconnaît un signe positif explicite', () => {
    expect(parseFrenchAmount('+1 234,56')).toEqual({ value: 1234.56, sign: 1 })
  })

  it('refuse un texte qui n’est pas un montant', () => {
    expect(parseFrenchAmount('AUCHAN')).toBeNull()
  })
})

describe('parseFrenchDate', () => {
  it('complète l’année à partir du jour/mois seul', () => {
    expect(parseFrenchDate('20/09', 2026)).toBe('2026-09-20')
  })

  it('lit une date complète jj/mm/aaaa', () => {
    expect(parseFrenchDate('20/09/2026', 2026)).toBe('2026-09-20')
  })

  it('complète une année sur deux chiffres', () => {
    expect(parseFrenchDate('20/09/26', 2026)).toBe('2026-09-20')
  })

  it('refuse un mois hors plage', () => {
    expect(parseFrenchDate('20/13/2026', 2026)).toBeNull()
  })
})

describe('normalizeMerchantLabel', () => {
  it('met en majuscules et retire les accents', () => {
    expect(normalizeMerchantLabel('Épicerie Générale')).toBe('EPICERIE GENERALE')
  })

  it('retire les mentions de moyen de paiement', () => {
    expect(normalizeMerchantLabel('CB AUCHAN PARIS')).toBe('AUCHAN PARIS')
    expect(normalizeMerchantLabel('PAIEMENT CB LIDL')).toBe('LIDL')
    expect(normalizeMerchantLabel('PRLV EDF')).toBe('EDF')
  })

  it('retire les codes numériques de magasin', () => {
    expect(normalizeMerchantLabel('AUCHAN SUPERMARCHE 057')).toBe('AUCHAN SUPERMARCHE')
    expect(normalizeMerchantLabel('AUCHAN 057')).toBe('AUCHAN')
  })

  it('retire une date mêlée au libellé', () => {
    expect(normalizeMerchantLabel('ACHAT CB 15/09 AUCHAN')).toBe('AUCHAN')
  })
})

describe('brandKey', () => {
  it('retient le premier mot comme identifiant de marque approximatif', () => {
    expect(brandKey('AUCHAN SUPERMARCHE')).toBe('AUCHAN')
    expect(brandKey('AUCHAN PARIS')).toBe('AUCHAN')
    expect(brandKey('AUCHAN')).toBe('AUCHAN')
  })
})

describe('parseStatementLine', () => {
  it('extrait date, libellé et montant négatif d’une ligne de dépense', () => {
    const result = parseStatementLine('20/09/2026  CB AUCHAN PARIS 15  -25,90 €', 2026)
    expect(result).toEqual({
      rawLine: '20/09/2026  CB AUCHAN PARIS 15  -25,90 €',
      date: '2026-09-20',
      label: 'CB AUCHAN PARIS 15',
      amount: 25.9,
      kind: 'depense',
    })
  })

  it('extrait un montant positif comme un revenu', () => {
    const result = parseStatementLine('05/09  VIR SALAIRE ENTREPRISE X  +1 234,56', 2026)
    expect(result?.kind).toBe('revenu')
    expect(result?.amount).toBe(1234.56)
  })

  it('marque un montant sans signe explicite comme incertain', () => {
    const result = parseStatementLine('12/09  CARREFOUR MARKET  18,40 €', 2026)
    expect(result?.kind).toBe('inconnu')
    expect(result?.amount).toBe(18.4)
  })

  it('complète l’année manquante avec l’année de référence', () => {
    const result = parseStatementLine('20/09  LIDL  -12,00', 2026)
    expect(result?.date).toBe('2026-09-20')
  })

  // Un OCR restitue rarement l'espace fine des milliers : « 2 350,00 » revient
  // le plus souvent « 2350,00 ». Ces montants doivent être lus tels quels, et
  // non découpés en « 235 » puis « 0,00 », ce qui faisait disparaître la ligne.
  it('lit un montant de quatre chiffres sans séparateur de milliers', () => {
    const result = parseStatementLine('08/09  VIR SALAIRE SEPTEMBRE  +2350,00 EUR', 2026)
    expect(result?.amount).toBe(2350)
    expect(result?.kind).toBe('revenu')
    expect(result?.label).toBe('VIR SALAIRE SEPTEMBRE')
  })

  it('lit un montant de cinq chiffres sans séparateur de milliers', () => {
    expect(parseStatementLine('08/09  VIREMENT NOTAIRE  -12500,00', 2026)?.amount).toBe(12500)
  })

  it('lit indifféremment les deux écritures du même montant', () => {
    const grouped = parseStatementLine('08/09  LOYER  -1 250,00', 2026)
    const plain = parseStatementLine('08/09  LOYER  -1250,00', 2026)
    expect(plain?.amount).toBe(grouped?.amount)
    expect(plain?.amount).toBe(1250)
  })

  // Le montant reste le dernier nombre de la ligne : un code de magasin placé
  // avant le libellé ne doit pas être pris pour lui.
  it('ne confond pas un code de magasin avec le montant', () => {
    const result = parseStatementLine('05/09  CB CARREFOUR 4021 PARIS  -45,90 €', 2026)
    expect(result?.amount).toBe(45.9)
    expect(result?.kind).toBe('depense')
  })

  it('rejette une ligne sans date', () => {
    expect(parseStatementLine('Solde précédent : 1 200,00 €', 2026)).toBeNull()
  })

  it('rejette une ligne sans montant', () => {
    expect(parseStatementLine('20/09/2026  Relevé de compte', 2026)).toBeNull()
  })
})

describe('parseStatementText', () => {
  it('ignore les lignes non reconnues et garde les opérations valides', () => {
    const text = [
      'RELEVÉ DE COMPTE — SEPTEMBRE 2026',
      '20/09/2026  CB AUCHAN PARIS 15  -25,90 €',
      'Solde précédent : 1 200,00 €',
      '22/09/2026  VIR SALAIRE  +1 500,00 €',
      '',
    ].join('\n')

    const result = parseStatementText(text, 2026)
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe('depense')
    expect(result[1].kind).toBe('revenu')
  })
})

describe('computeFingerprint et détection de doublons', () => {
  it('produit la même empreinte pour des libellés bruts équivalents', () => {
    const a = computeFingerprint('2026-09-20', 25.9, 'AUCHAN SUPERMARCHE 057')
    const b = computeFingerprint('2026-09-20', 25.9, 'AUCHAN SUPERMARCHE 057')
    expect(a).toBe(b)
  })

  it('diffère si le montant ou la date change', () => {
    const a = computeFingerprint('2026-09-20', 25.9, 'AUCHAN')
    const b = computeFingerprint('2026-09-21', 25.9, 'AUCHAN')
    const c = computeFingerprint('2026-09-20', 30, 'AUCHAN')
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('repère une dépense existante comme doublon via son enseigne', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        date: '2026-09-20',
        monthKey: '2026-09',
        categoryId: 'cat-courses',
        merchantId: 'm-auchan',
        description: '',
        amount: 25.9,
        type: 'variable',
        plannedAmount: null,
        status: 'paye',
        note: '',
        confidential: false,
        recurringId: null,
        createdAt: '2026-09-20T10:00:00.000Z',
        updatedAt: '2026-09-20T10:00:00.000Z',
      },
    ]
    const known = buildExistingFingerprints(expenses, (id) => (id === 'm-auchan' ? 'Auchan' : undefined))
    // Même empreinte que la dépense existante : même normalisation du nom
    // d'enseigne, seule la mention du moyen de paiement diffère.
    const incoming = computeFingerprint('2026-09-20', 25.9, 'CB AUCHAN')
    expect(isDuplicateFingerprint(incoming, known)).toBe(true)
  })

  it('ne signale pas de doublon pour une opération réellement différente', () => {
    const known = buildExistingFingerprints([], () => undefined)
    const incoming = computeFingerprint('2026-09-20', 25.9, 'AUCHAN')
    expect(isDuplicateFingerprint(incoming, known)).toBe(false)
  })
})

describe('proposeCategorization', () => {
  const merchants: Merchant[] = [{ id: 'm-auchan', name: 'Auchan', sortOrder: 0 }]

  it('applique une règle apprise exacte en priorité', () => {
    const rules: CategorizationRule[] = [
      {
        id: 'r1',
        normalizedPattern: 'AUCHAN SUPERMARCHE',
        merchantId: 'm-auchan',
        categoryId: 'cat-courses',
        expenseType: 'variable',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]
    const proposal = proposeCategorization('AUCHAN SUPERMARCHE 057', {
      rules,
      aliases: [],
      merchants,
      expenses: [],
    })
    expect(proposal.categoryId).toBe('cat-courses')
    expect(proposal.merchantId).toBe('m-auchan')
    expect(proposal.categoryConfidence).toBe('haute')
  })

  it('utilise un alias d’enseigne appris et déduit la catégorie la plus fréquente', () => {
    const aliases: MerchantAlias[] = [
      { id: 'a1', normalizedPattern: 'AUCHAN', merchantId: 'm-auchan', createdAt: '2026-09-01T00:00:00.000Z' },
    ]
    const expenses: Expense[] = [
      expenseFor('m-auchan', 'cat-courses'),
      expenseFor('m-auchan', 'cat-courses'),
      expenseFor('m-auchan', 'cat-loisirs'),
    ]
    const proposal = proposeCategorization('AUCHAN 057', { rules: [], aliases, merchants, expenses })
    expect(proposal.merchantId).toBe('m-auchan')
    expect(proposal.merchantConfidence).toBe('haute')
    expect(proposal.categoryId).toBe('cat-courses')
  })

  it('rapproche par marque une enseigne existante sans règle apprise', () => {
    const proposal = proposeCategorization('CB AUCHAN PARIS', {
      rules: [],
      aliases: [],
      merchants,
      expenses: [],
    })
    expect(proposal.merchantId).toBe('m-auchan')
    expect(proposal.merchantConfidence).toBe('moyenne')
  })

  it('ne propose rien pour un libellé totalement inconnu', () => {
    const proposal = proposeCategorization('COMMERCE INCONNU XYZ', {
      rules: [],
      aliases: [],
      merchants,
      expenses: [],
    })
    expect(proposal.merchantId).toBeNull()
    expect(proposal.categoryId).toBeNull()
    expect(proposal.merchantConfidence).toBe('faible')
    expect(proposal.suggestedMerchantName).toBe('Commerce Inconnu Xyz')
  })
})

function expenseFor(merchantId: string, categoryId: string): Expense {
  return {
    id: `e-${Math.random()}`,
    date: '2026-09-10',
    monthKey: '2026-09',
    categoryId,
    merchantId,
    description: '',
    amount: 10,
    type: 'variable',
    plannedAmount: null,
    status: 'paye',
    note: '',
    confidential: false,
    recurringId: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
  }
}
