import type {
  Category,
  Expense,
  Merchant,
  MonthBudget,
  RecurringExpense,
} from '@/models/types'
import { daysInMonth, makeMonthKey } from '@/models/types'

/**
 * Jeu de données initial, repris à l'identique du classeur Excel d'origine puis
 * de l'application Swift : mêmes catégories, mêmes enseignes, mêmes récurrentes
 * avec leurs montants et jours du mois.
 *
 * Les identifiants sont **stables et lisibles** (`cat-logement`) plutôt
 * qu'aléatoires : une sauvegarde JSON reste compréhensible à l'œil nu, et deux
 * installations neuves produisent les mêmes clés.
 */

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-logement', name: 'Logement', icon: 'home', sortOrder: 0 },
  { id: 'cat-vehicule', name: 'Véhicule', icon: 'car', sortOrder: 1 },
  { id: 'cat-telecom', name: 'Télécommunications', icon: 'signal', sortOrder: 2 },
  { id: 'cat-abonnements', name: 'Abonnements', icon: 'repeat', sortOrder: 3 },
  { id: 'cat-equipements', name: 'Équipements', icon: 'device', sortOrder: 4 },
  { id: 'cat-courses', name: 'Courses', icon: 'cart', sortOrder: 5 },
  { id: 'cat-alimentation', name: 'Alimentation', icon: 'food', sortOrder: 6 },
  { id: 'cat-restaurants', name: 'Restaurants', icon: 'restaurant', sortOrder: 7 },
  { id: 'cat-loisirs', name: 'Loisirs', icon: 'sport', sortOrder: 8 },
  { id: 'cat-vetements', name: 'Vêtements', icon: 'clothes', sortOrder: 9 },
  { id: 'cat-sante', name: 'Santé', icon: 'health', sortOrder: 10 },
  { id: 'cat-transport', name: 'Transport', icon: 'transport', sortOrder: 11 },
  { id: 'cat-cadeaux', name: 'Cadeaux', icon: 'gift', sortOrder: 12 },
  { id: 'cat-vacances', name: 'Vacances', icon: 'plane', sortOrder: 13 },
  { id: 'cat-autres', name: 'Autres', icon: 'dots', sortOrder: 14 },
]

export const SEED_MERCHANTS: Merchant[] = [
  'Hmarket',
  'Carrefour',
  'Auchan',
  'Lidl',
  'E.Leclerc',
  'Intermarché',
  'Aldi',
  'Monoprix',
  'Franprix',
  'Grand Frais',
  'Picard',
  'Autre',
].map((name, index) => ({
  id: `mer-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name,
  sortOrder: index,
}))

/** Les 14 récurrentes du classeur. */
export const SEED_RECURRING: RecurringExpense[] = [
  ['Loyer + badge', 'cat-logement', 779, 5, ''],
  ['Crédit Impot', 'cat-autres', 527, 5, 'Mensualité de crédit'],
  ['Assurance voiture', 'cat-vehicule', 93, 8, ''],
  ['Assurance habitation', 'cat-logement', 18.8, 8, ''],
  ['Abonnement téléphone', 'cat-telecom', 9.99, 10, ''],
  ['Abonnement téléphone épouse', 'cat-telecom', 8.99, 10, ''],
  ['Fibre Internet appartement', 'cat-telecom', 22.99, 10, ''],
  ['iPhone 16 Pro Max', 'cat-equipements', 63, 12, 'Mensualité'],
  ['TV', 'cat-equipements', 50, 12, 'Mensualité'],
  ['PlayStation 5', 'cat-equipements', 22.5, 12, 'Mensualité'],
  ['Basic-Fit', 'cat-loisirs', 25, 15, 'Abonnement salle'],
  ['ChatGPT', 'cat-abonnements', 23, 15, 'Abonnement mensuel'],
  ['Claude', 'cat-abonnements', 21.61, 15, 'Abonnement mensuel'],
  ['Électricité', 'cat-logement', 40, 20, 'Prélèvement mensuel'],
].map(([description, categoryId, plannedAmount, dayOfMonth, note], index) => ({
  id: `rec-${index + 1}`,
  categoryId: categoryId as string,
  merchantId: '',
  description: description as string,
  plannedAmount: plannedAmount as number,
  dayOfMonth: dayOfMonth as number,
  type: 'fixe' as const,
  note: note as string,
  // Seul le crédit est marqué confidentiel dans le classeur d'origine.
  confidential: description === 'Crédit Impot',
  active: true,
  sortOrder: index,
}))

export const DEMO_SALARY = 3000
export const DEMO_SAVINGS_GOAL = 300

interface DemoRow {
  day: number
  categoryId: string
  merchantId: string
  description: string
  amount: number
  type: 'fixe' | 'variable' | 'exceptionnelle'
  status: 'paye' | 'aPayer'
  confidential: boolean
  note: string
}

/**
 * Un mois type. Les récurrentes sont réglées, quelques dépenses variables
 * s'y ajoutent, et deux lignes restent « à payer » pour que le rappel du
 * tableau de bord soit visible dès le premier lancement.
 */
const DEMO_ROWS: DemoRow[] = [
  { day: 5, categoryId: 'cat-logement', merchantId: '', description: 'Loyer + badge', amount: 779, type: 'fixe', status: 'paye', confidential: false, note: '' },
  { day: 5, categoryId: 'cat-autres', merchantId: '', description: 'Crédit Impot', amount: 527, type: 'fixe', status: 'paye', confidential: true, note: 'Mensualité de crédit' },
  { day: 8, categoryId: 'cat-vehicule', merchantId: '', description: 'Assurance voiture', amount: 93, type: 'fixe', status: 'paye', confidential: false, note: '' },
  { day: 8, categoryId: 'cat-logement', merchantId: '', description: 'Assurance habitation', amount: 18.8, type: 'fixe', status: 'paye', confidential: false, note: '' },
  { day: 10, categoryId: 'cat-telecom', merchantId: '', description: 'Abonnement téléphone', amount: 9.99, type: 'fixe', status: 'paye', confidential: false, note: '' },
  { day: 10, categoryId: 'cat-telecom', merchantId: '', description: 'Abonnement téléphone épouse', amount: 8.99, type: 'fixe', status: 'paye', confidential: false, note: '' },
  { day: 10, categoryId: 'cat-telecom', merchantId: '', description: 'Fibre Internet appartement', amount: 22.99, type: 'fixe', status: 'paye', confidential: false, note: '' },
  { day: 12, categoryId: 'cat-equipements', merchantId: '', description: 'iPhone 16 Pro Max', amount: 63, type: 'fixe', status: 'paye', confidential: false, note: 'Mensualité' },
  { day: 12, categoryId: 'cat-equipements', merchantId: '', description: 'TV', amount: 50, type: 'fixe', status: 'paye', confidential: false, note: 'Mensualité' },
  { day: 12, categoryId: 'cat-equipements', merchantId: '', description: 'PlayStation 5', amount: 22.5, type: 'fixe', status: 'paye', confidential: false, note: 'Mensualité' },
  { day: 14, categoryId: 'cat-restaurants', merchantId: 'mer-autre', description: 'Restaurant', amount: 45, type: 'variable', status: 'paye', confidential: false, note: 'Anniversaire' },
  { day: 15, categoryId: 'cat-loisirs', merchantId: '', description: 'Basic-Fit', amount: 25, type: 'fixe', status: 'paye', confidential: false, note: 'Abonnement salle' },
  { day: 15, categoryId: 'cat-abonnements', merchantId: '', description: 'ChatGPT', amount: 23, type: 'fixe', status: 'paye', confidential: false, note: 'Abonnement mensuel' },
  { day: 16, categoryId: 'cat-courses', merchantId: 'mer-carrefour', description: 'Courses Carrefour', amount: 82, type: 'variable', status: 'paye', confidential: false, note: 'Courses de la semaine' },
  { day: 18, categoryId: 'cat-vetements', merchantId: 'mer-autre', description: 'Chaussures', amount: 120, type: 'variable', status: 'paye', confidential: false, note: 'Nike' },
  { day: 19, categoryId: 'cat-courses', merchantId: 'mer-lidl', description: 'Courses Lidl', amount: 46.3, type: 'variable', status: 'paye', confidential: false, note: '' },
  { day: 21, categoryId: 'cat-vehicule', merchantId: 'mer-autre', description: 'Essence', amount: 70, type: 'variable', status: 'paye', confidential: false, note: 'Plein voiture' },
  { day: 24, categoryId: 'cat-cadeaux', merchantId: 'mer-autre', description: 'Cadeau', amount: 50, type: 'exceptionnelle', status: 'paye', confidential: true, note: 'Cadeau surprise' },
  { day: 15, categoryId: 'cat-abonnements', merchantId: '', description: 'Claude', amount: 21.61, type: 'fixe', status: 'aPayer', confidential: false, note: 'Abonnement mensuel' },
  { day: 20, categoryId: 'cat-logement', merchantId: '', description: 'Électricité', amount: 40, type: 'fixe', status: 'aPayer', confidential: false, note: 'Prélèvement mensuel' },
]

/** Construit les dépenses de démonstration sur le mois de `reference`. */
export function buildDemoExpenses(reference: Date = new Date()): Expense[] {
  const year = reference.getFullYear()
  const month = reference.getMonth() + 1
  const monthKey = makeMonthKey(year, month)
  const limit = daysInMonth(year, month)
  const now = new Date().toISOString()

  const plannedByDescription = new Map(
    SEED_RECURRING.map((item) => [item.description, item.plannedAmount]),
  )
  const recurringByDescription = new Map(
    SEED_RECURRING.map((item) => [item.description, item.id]),
  )

  return DEMO_ROWS.map((row, index) => {
    const day = String(Math.min(row.day, limit)).padStart(2, '0')
    return {
      id: `demo-${index + 1}`,
      date: `${monthKey}-${day}`,
      monthKey,
      categoryId: row.categoryId,
      merchantId: row.merchantId,
      description: row.description,
      amount: row.amount,
      type: row.type,
      plannedAmount: plannedByDescription.get(row.description) ?? null,
      status: row.status,
      note: row.note,
      confidential: row.confidential,
      recurringId: recurringByDescription.get(row.description) ?? null,
      createdAt: now,
      updatedAt: now,
    }
  })
}

export function buildDemoBudget(reference: Date = new Date()): MonthBudget {
  const year = reference.getFullYear()
  const month = reference.getMonth() + 1
  return {
    id: makeMonthKey(year, month),
    year,
    month,
    salary: DEMO_SALARY,
    savingsGoal: DEMO_SAVINGS_GOAL,
  }
}
