import type { ExpenseType } from './types'

/**
 * Modèles de l'import de dépenses depuis une image (capture bancaire, photo
 * de ticket…), traitée entièrement en local par OCR.
 */

/** Ce qu'un examen sommaire du signe permet de dire d'une ligne extraite. */
export type TransactionKind = 'depense' | 'revenu' | 'inconnu'

/** Fiabilité estimée d'un champ extrait, affichée pour signaler l'incertain. */
export type ConfidenceLevel = 'haute' | 'moyenne' | 'faible'

export interface FieldConfidence {
  date: ConfidenceLevel
  amount: ConfidenceLevel
  merchant: ConfidenceLevel
  category: ConfidenceLevel
}

/** Devenir d'une transaction extraite dans l'écran de rapport. */
export type ImportedTransactionStatus = 'proposee' | 'validee' | 'ignoree' | 'doublon'

/**
 * Une ligne détectée dans une image, avant ou après relecture par
 * l'utilisateur. Persistée avec sa session le temps de constituer
 * l'historique des imports — jamais l'image source (voir `ImportSession`).
 */
export interface ImportedTransaction {
  id: string
  sessionId: string

  /** Texte brut tel que lu par l'OCR, pour comprendre une extraction ratée. */
  rawLine: string

  date: string | null
  label: string
  amount: number | null
  kind: TransactionKind

  categoryId: string | null
  merchantId: string | null
  /** Nom d'enseigne proposé quand aucune enseigne existante ne correspond. */
  suggestedMerchantName: string | null

  confidence: FieldConfidence
  status: ImportedTransactionStatus

  /** Empreinte de déduplication : `date|montant|libellé normalisé`. */
  fingerprint: string
  /** Dépense existante jugée être un doublon probable, s'il y en a une. */
  duplicateOfExpenseId: string | null

  /** Renseigné une fois la transaction transformée en dépense réelle. */
  createdExpenseId: string | null
}

/** Un import mené à bien, conservé pour l'historique des Réglages. */
export interface ImportSession {
  id: string
  createdAt: string
  sourceLabel: string
  /** L'image source n'est jamais gardée par défaut — voir item 29. */
  imageRetained: boolean

  detectedCount: number
  addedCount: number
  ignoredCount: number
  duplicateCount: number
  totalAmountAdded: number

  status: 'analyse' | 'terminee' | 'annulee'
}

/**
 * Un alias appris entre un libellé bancaire normalisé et une enseigne.
 *
 * `normalizedPattern` est la forme canonique du libellé (voir
 * `merchantNormalizer.ts`) : « AUCHAN SUPERMARCHE 057 », « CB AUCHAN PARIS »
 * et « AUCHAN 057 » normalisent tous vers le même motif, ce qui évite de
 * créer trois enseignes pour un seul commerçant.
 */
export interface MerchantAlias {
  id: string
  normalizedPattern: string
  merchantId: string
  createdAt: string
}

/**
 * Une règle apprise « ce motif de libellé → cette catégorie ». Indépendante
 * de `MerchantAlias` : une même enseigne peut légitimement se répartir sur
 * plusieurs catégories, mais dans l'usage courant (bailleur d'un même
 * commerce) le dernier choix de l'utilisateur est le plus prédictif — d'où le
 * remplacement plutôt que l'accumulation à l'apprentissage.
 */
export interface CategorizationRule {
  id: string
  normalizedPattern: string
  merchantId: string | null
  categoryId: string
  expenseType: ExpenseType | null
  createdAt: string
  updatedAt: string
}
