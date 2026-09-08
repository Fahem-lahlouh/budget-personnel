import type { Category, Expense, Merchant } from '@/models/types'
import { STATUS_LABELS, TYPE_LABELS } from '@/models/types'
import { varianceOf } from './budgetEngine'

/**
 * Export CSV, pensé pour être ré-ouvert dans Excel et Numbers en français :
 * séparateur `;`, décimale `,`, et **BOM UTF-8** en tête — sans lui, Excel
 * affiche « Ã© » à la place de « é ».
 */

const HEADERS = [
  'Date',
  'Catégorie',
  'Enseigne',
  'Description',
  'Montant',
  'Type',
  'Prévu',
  'Écart',
  'Statut',
  'Remarque',
  'Confidentiel',
]

interface CsvOptions {
  expenses: Expense[]
  categories: Category[]
  merchants: Merchant[]
  /** Quand `false`, les dépenses confidentielles sont exclues du fichier. */
  includeConfidential: boolean
}

export function buildCsv({
  expenses,
  categories,
  merchants,
  includeConfidential,
}: CsvOptions): string {
  const categoryNames = new Map(categories.map((item) => [item.id, item.name]))
  const merchantNames = new Map(merchants.map((item) => [item.id, item.name]))

  const rows = expenses
    .filter((expense) => includeConfidential || !expense.confidential)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)))

  const lines = [HEADERS.join(';')]

  for (const expense of rows) {
    const variance = varianceOf(expense)
    lines.push(
      [
        expense.date,
        categoryNames.get(expense.categoryId) ?? '',
        merchantNames.get(expense.merchantId) ?? '',
        expense.description,
        decimal(expense.amount),
        TYPE_LABELS[expense.type],
        expense.plannedAmount === null ? '' : decimal(expense.plannedAmount),
        variance === null ? '' : decimal(variance),
        STATUS_LABELS[expense.status],
        expense.note,
        expense.confidential ? 'Oui' : 'Non',
      ]
        .map(escape)
        .join(';'),
    )
  }

  return lines.join('\r\n')
}

/** Encode le CSV avec son BOM, prêt à être téléchargé. */
export function csvBlob(csv: string): Blob {
  return new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csv], {
    type: 'text/csv;charset=utf-8',
  })
}

export function csvFileName(date = new Date()): string {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
  return `budget-personnel-${stamp}.csv`
}

function decimal(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/** Guillemets doublés, champ encadré dès qu'il contient un séparateur. */
function escape(field: string): string {
  if (!/[;"\n\r]/.test(field)) return field
  return `"${field.replace(/"/g, '""')}"`
}
