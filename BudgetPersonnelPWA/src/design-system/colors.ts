import { OTHERS_ID } from '@/models/types'

/**
 * Couleurs des séries de données.
 *
 * Six teintes, dans un **ordre fixe, jamais cyclé** : la 7ᵉ catégorie n'obtient
 * pas une couleur générée, elle est regroupée sous « Autres » (voir
 * `topWithOthers` dans le BudgetEngine). Le gris de « Autres » est réservé et
 * ne sert jamais de couleur de série.
 *
 * Les deux jeux (clair et sombre) ont été validés : bande de clarté, plancher
 * de chroma, séparation deutan/tritan entre teintes voisines, plancher en
 * vision normale, et contraste sur la surface de la carte.
 */

const SERIES_COUNT = 6

/** Couleur de la n-ième série. Au-delà de six, la teinte neutre « Autres ». */
export function categoryColor(index: number): string {
  if (index < 0 || index >= SERIES_COUNT) return 'var(--cat-other)'
  return `var(--cat-${index + 1})`
}

/**
 * Couleur d'un secteur du donut, choisie sur son **identifiant**.
 *
 * Le gris est réservé au regroupement « Autres » ; s'appuyer sur le libellé
 * donnerait la même couleur à une vraie catégorie que l'utilisateur aurait
 * nommée « Autres ».
 */
export function sliceColor(id: string, index: number): string {
  return id === OTHERS_ID ? 'var(--cat-other)' : categoryColor(index)
}

/**
 * Couleurs de statut, réservées : elles n'entrent jamais dans la rotation
 * catégorielle, pour qu'un vert veuille toujours dire « bon » et un rouge
 * « problème ».
 */
export const STATUS_COLORS = {
  positive: 'var(--positive)',
  warning: 'var(--warning)',
  negative: 'var(--negative)',
  accent: 'var(--accent)',
  neutral: 'var(--cat-other)',
} as const

/** Couleur associée à un type de dépense (fixe / variable / exceptionnelle). */
export const TYPE_COLORS: Record<string, string> = {
  fixe: 'var(--cat-1)',
  variable: 'var(--cat-3)',
  exceptionnelle: 'var(--cat-2)',
}

/** Couleur associée à un statut de règlement. */
export const PAYMENT_COLORS: Record<string, string> = {
  paye: 'var(--positive)',
  aPayer: 'var(--warning)',
}
