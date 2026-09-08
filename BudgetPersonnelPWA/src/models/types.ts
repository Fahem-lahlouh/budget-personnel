/**
 * Modèle de données de Budget Personnel.
 *
 * Différence assumée avec l'app Swift : les catégories et enseignes y étaient
 * stockées **par nom** dans chaque dépense. Ici elles sont référencées **par
 * identifiant**. Renommer « Courses » en « Alimentation » n'a donc plus besoin
 * de réécrire toutes les dépenses concernées, et l'historique ne peut pas se
 * désolidariser d'une liste modifiée.
 */

/** Version du schéma persisté. À incrémenter à chaque migration IndexedDB. */
export const SCHEMA_VERSION = 1

/**
 * Identifiant du regroupement « Autres » des graphiques.
 *
 * Ce n'est pas une catégorie réelle : c'est le cumul de tout ce qui sort du
 * top 5. Il porte un identifiant réservé pour ne jamais être confondu avec une
 * catégorie que l'utilisateur aurait lui-même nommée « Autres ».
 */
export const OTHERS_ID = '__others__'

export type ExpenseType = 'fixe' | 'variable' | 'exceptionnelle'
export type PaymentStatus = 'paye' | 'aPayer'
export type ThemePreference = 'system' | 'light' | 'dark'

export const EXPENSE_TYPES: ExpenseType[] = ['fixe', 'variable', 'exceptionnelle']
export const PAYMENT_STATUSES: PaymentStatus[] = ['paye', 'aPayer']

export interface Category {
  id: string
  name: string
  /** Nom d'icône résolu par `src/design-system/icons.tsx`. */
  icon: string
  sortOrder: number
}

export interface Merchant {
  id: string
  name: string
  sortOrder: number
}

export interface Expense {
  id: string
  /** Date de la dépense, au format `YYYY-MM-DD` (jour local, sans fuseau). */
  date: string
  /** Clé `YYYY-MM`, dupliquée pour servir d'index IndexedDB sur le mois. */
  monthKey: string
  categoryId: string
  /** Vide quand aucune enseigne n'est renseignée. */
  merchantId: string
  description: string
  amount: number
  type: ExpenseType
  /** Montant budgété, `null` quand la dépense n'a pas de budget associé. */
  plannedAmount: number | null
  status: PaymentStatus
  note: string
  confidential: boolean
  /** Récurrente d'origine, quand la dépense a été créée depuis un modèle. */
  recurringId: string | null
  createdAt: string
  updatedAt: string
}

export interface RecurringExpense {
  id: string
  categoryId: string
  merchantId: string
  description: string
  plannedAmount: number
  /** Jour habituel dans le mois (1–31), borné au dernier jour réel du mois. */
  dayOfMonth: number
  type: ExpenseType
  note: string
  confidential: boolean
  active: boolean
  sortOrder: number
}

export interface MonthBudget {
  /** Clé `YYYY-MM`. */
  id: string
  year: number
  month: number
  salary: number
  savingsGoal: number
}

export interface AppSettings {
  id: 'settings'
  schemaVersion: number
  theme: ThemePreference
  /** Un code PIN est configuré et l'app se verrouille. */
  lockEnabled: boolean
  /** Déverrouillage biométrique via WebAuthn activé (nécessite `lockEnabled`). */
  biometricsEnabled: boolean
  /**
   * Les dépenses marquées « Confidentiel » restent masquées après le
   * déverrouillage global, jusqu'à une authentification dédiée.
   */
  secondLevelForConfidential: boolean
  /** Le jeu de démonstration a déjà été installé (ne pas le réinjecter). */
  demoSeeded: boolean
}

/** Paramètres de vérification du code PIN, stockés sans jamais le code lui-même. */
export interface PinRecord {
  id: 'pin'
  /** Sel aléatoire, encodé en base64. */
  salt: string
  /** Empreinte PBKDF2 du code, encodée en base64. */
  hash: string
  iterations: number
  algorithm: 'PBKDF2-SHA256'
}

/** Justificatif WebAuthn enregistré pour le déverrouillage biométrique. */
export interface WebAuthnRecord {
  id: 'webauthn'
  credentialId: string
  /** Clé publique de la paire, au format SPKI encodé en base64. */
  publicKey: string
  algorithm: number
  createdAt: string
}

// MARK: - Libellés

export const TYPE_LABELS: Record<ExpenseType, string> = {
  fixe: 'Fixe',
  variable: 'Variable',
  exceptionnelle: 'Exceptionnelle',
}

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  paye: 'Payé',
  aPayer: 'À payer',
}

// MARK: - Utilitaires de date

/** `2026-09-05` → `2026-09` */
export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

export function makeMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-')
  return { year: Number(year), month: Number(month) }
}

/** Date du jour au format `YYYY-MM-DD`, dans le fuseau local. */
export function todayISO(reference: Date = new Date()): string {
  return toISODate(reference)
}

/**
 * Formate une `Date` en `YYYY-MM-DD` **local**.
 *
 * `toISOString()` convertirait en UTC : une dépense saisie le 1er du mois à
 * 00h30 en France basculerait au dernier jour du mois précédent, et se
 * retrouverait dans le mauvais budget mensuel.
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Nombre de jours dans un mois donné (année/mois 1-indexé). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Décale un couple année/mois de `delta` mois. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** Échéance d'une récurrente dans un mois, ramenée au dernier jour si besoin. */
export function dueDateOf(
  recurring: Pick<RecurringExpense, 'dayOfMonth'>,
  year: number,
  month: number,
): string {
  const day = Math.min(Math.max(recurring.dayOfMonth, 1), daysInMonth(year, month))
  return `${makeMonthKey(year, month)}-${String(day).padStart(2, '0')}`
}
