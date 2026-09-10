import { parseFrenchAmount, parseStatementDate } from './amountParser'

/**
 * Lecture d'un ticket de caisse.
 *
 * Un ticket ne se lit pas comme un relevé bancaire. Le relevé aligne des
 * opérations indépendantes, une par ligne ; le ticket décrit un seul achat,
 * en trois zones : l'enseigne en tête, les articles au milieu, et un pied de
 * ticket (total, moyen de paiement, TVA) qu'il faut savoir écarter — sans
 * quoi « CARTE BANCAIRE 5,57 » deviendrait un article à 5,57 €.
 *
 * Rien n'est deviné en silence : ce qui n'a pas pu être lu ressort `null` et
 * l'écran de vérification le demande.
 */

export interface ParsedReceiptItem {
  label: string
  quantity: number | null
  unitPrice: number | null
  totalPrice: number
}

export interface ParsedReceipt {
  merchantName: string | null
  purchasedAt: string | null
  /** Total lu dans le pied de ticket, `null` si aucune ligne ne l'annonce. */
  total: number | null
  items: ParsedReceiptItem[]
  rawText: string
}

/**
 * Prix en fin de ligne. Les décimales sont exigées — un ticket les écrit
 * toujours — ce qui écarte les codes article et références qui traînent en
 * bout de ligne. La lettre finale optionnelle est le code de taux de TVA que
 * beaucoup de caisses impriment après le prix (« 2,15 B »).
 *
 * La partie entière n'accepte l'espace qu'en séparateur de milliers, par
 * groupes de trois chiffres. Une classe de caractères libre le franchirait :
 * sur « 4 x 0,75 3,00 » elle lirait « 75 3,00 », soit 753 €.
 */
const TRAILING_PRICE = /(-)?\s*((?:\d{1,3}(?:[ \u00A0.]\d{3})+|\d+),\d{2})\s*(?:€|EUR)?\s*(?:[A-Z])?\s*$/

/** « 2 x 1,17 », « 2X1,17 », « 0,850 kg x 2,99 » : quantité et prix unitaire. */
const QUANTITY_PATTERN = /(\d+(?:[.,]\d+)?)\s*(?:kg|g|l|cl)?\s*[xX*]\s*((?:\d{1,3}(?:[ \u00A0.]\d{3})+|\d+),\d{2})/

/** Ligne qui ne porte qu'une quantité : elle décrit l'article suivant. */
const QUANTITY_ONLY_LINE = /^\s*\d+(?:[.,]\d+)?\s*(?:kg|g|l|cl)?\s*[xX*]\s*(?:\d{1,3}(?:[ \u00A0.]\d{3})+|\d+),\d{2}\s*(?:€|EUR)?\s*$/

/** Le total du ticket. `SOUS-TOTAL` et `TOTAL TVA` n'en sont pas. */
const TOTAL_LINE = /\b(?:total|net\s*(?:a|à)\s*payer|montant\s*(?:a|à)\s*payer|(?:a|à)\s*payer)\b/i
const NOT_A_TOTAL = /\b(?:sous[-\s]?total|total\s*tva|tva|dont\s*tva)\b/i

/**
 * Pied de ticket : moyens de paiement, taxes, points de fidélité. Ces lignes
 * portent un prix sans être des articles.
 */
const FOOTER_LINE =
  /\b(?:carte\s*bancaire|carte\s*bleue|cb|especes|esp(?:è|e)ces|monnaie|rendu|rendu\s*monnaie|ch(?:è|e)que|ticket\s*restaurant|titre\s*restaurant|paiement|montant\s*(?:du|d(?:û|u))|reste\s*(?:a|à)\s*payer|tva|ht|ttc|taux|dont|nb\s*articles?|nombre\s*d.articles?|articles?\s*:|points?|fid(?:é|e)lit(?:é|e)|cagnotte|avantage|solde|caisse|vendeur|siret|tel|t(?:é|e)l)\b/i

/** Enseigne : ce qui n'est ni une adresse, ni un téléphone, ni un prix. */
const ADDRESS_LINE = /\b(?:rue|avenue|boulevard|bd|place|chemin|route|zone|zac|cc|centre\s*commercial|cedex|tel|t(?:é|e)l|siret|rcs|sarl|sas|sa\b|snc)\b/i

const DATE_CANDIDATES = [
  /\d{4}-\d{2}-\d{2}/,
  /\d{2}[/.-]\d{2}[/.-]\d{2,4}/,
  /\d{2}[/.]\d{2}(?!\d)/,
]

function readTrailingPrice(line: string): { value: number; index: number } | null {
  const match = TRAILING_PRICE.exec(line)
  if (!match) return null

  const [, negative, digits] = match
  const parsed = parseFrenchAmount(digits.replace(/[ \u00A0]/g, ''))
  if (!parsed || parsed.value === 0) return null

  return { value: negative ? -parsed.value : parsed.value, index: match.index }
}

function findDate(lines: string[], referenceYear: number): string | null {
  for (const line of lines) {
    for (const pattern of DATE_CANDIDATES) {
      const raw = pattern.exec(line)?.[0]
      if (!raw) continue
      // Les caisses écrivent indifféremment 12/09/2026, 12-09-2026 ou
      // 12.09.2026 ; seule la forme ISO garde ses tirets.
      const normalized = /^\d{4}-/.test(raw) ? raw : raw.replace(/[.-]/g, '/')
      const parsed = parseStatementDate(normalized, referenceYear)
      if (parsed) return parsed
    }
  }
  return null
}

function findMerchant(lines: string[]): string | null {
  // L'enseigne est en tête de ticket, au-dessus de l'adresse. On ne regarde
  // que les premières lignes : plus bas, « BOULANGERIE » serait un article.
  for (const line of lines.slice(0, 6)) {
    if (readTrailingPrice(line)) continue
    if (ADDRESS_LINE.test(line) || FOOTER_LINE.test(line)) continue
    const letters = line.replace(/[^\p{L}]/gu, '')
    if (letters.length < 3) continue
    return line.replace(/\s+/g, ' ').trim()
  }
  return null
}

function findTotal(lines: string[]): number | null {
  const candidates = lines
    .filter((line) => TOTAL_LINE.test(line) && !NOT_A_TOTAL.test(line))
    .map((line) => readTrailingPrice(line)?.value)
    .filter((value): value is number => value !== undefined)

  if (candidates.length === 0) return null
  // Plusieurs lignes peuvent annoncer un total (« TOTAL », « À PAYER ») :
  // le vrai est le plus élevé, les autres étant des sous-ensembles.
  return Math.max(...candidates)
}

function readItems(lines: string[]): ParsedReceiptItem[] {
  const items: ParsedReceiptItem[] = []
  let pendingQuantity: { quantity: number; unitPrice: number } | null = null

  for (const line of lines) {
    if (QUANTITY_ONLY_LINE.test(line)) {
      pendingQuantity = readQuantity(line)
      continue
    }

    const price = readTrailingPrice(line)
    if (!price) continue
    if (TOTAL_LINE.test(line) || FOOTER_LINE.test(line)) {
      pendingQuantity = null
      continue
    }

    const inline = readQuantity(line)
    const quantity = inline ?? pendingQuantity
    pendingQuantity = null

    // Le libellé est ce qui précède le prix, débarrassé de l'éventuelle
    // expression de quantité qui s'y trouve aussi.
    const label = line
      .slice(0, price.index)
      .replace(QUANTITY_PATTERN, ' ')
      .replace(/[-–|*.:]+$/, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (label.replace(/[^\p{L}]/gu, '').length < 2) continue

    items.push({
      label,
      quantity: quantity?.quantity ?? null,
      unitPrice: quantity?.unitPrice ?? null,
      totalPrice: price.value,
    })
  }

  return items
}

function readQuantity(line: string): { quantity: number; unitPrice: number } | null {
  const match = QUANTITY_PATTERN.exec(line)
  if (!match) return null

  const quantity = Number.parseFloat(match[1].replace(',', '.'))
  const unitPrice = parseFrenchAmount(match[2].replace(/[ \u00A0]/g, ''))
  if (!Number.isFinite(quantity) || quantity <= 0 || !unitPrice) return null

  return { quantity, unitPrice: unitPrice.value }
}

export function parseReceipt(text: string, referenceYear: number): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return {
    merchantName: findMerchant(lines),
    purchasedAt: findDate(lines, referenceYear),
    total: findTotal(lines),
    items: readItems(lines),
    rawText: text,
  }
}
