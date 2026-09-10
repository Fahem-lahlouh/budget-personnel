import { parseFrenchAmount, parseStatementDate } from './amountParser'
import type { TransactionKind } from '@/models/import'

export interface ParsedLine {
  rawLine: string
  date: string
  label: string
  /** Toujours positif : le sens (dépense/revenu) est porté par `kind`. */
  amount: number
  kind: TransactionKind
}

/**
 * `jj/mm[/aa[aa]]` sur un relevé imprimé, `aaaa-mm-jj` dans les applications
 * bancaires mobiles — ce sont elles que l'on photographie le plus souvent.
 */
const DATE_TOKEN = /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(?:\/\d{2,4})?/

/**
 * Montant en fin de ligne. Les espaces sont tolérés à l'intérieur du nombre :
 * l'OCR en insère (« -1 2,1 6 € » pour « -12,16 € ») et le séparateur de
 * milliers français en est un — les retirer donne le bon nombre dans les deux
 * cas. En contrepartie un nombre n'est retenu que s'il porte des décimales ou
 * un symbole monétaire, sans quoi un numéro de carte ou une référence de
 * mandat terminant la ligne passerait pour une somme.
 */
const TRAILING_AMOUNT = /([+-])?\s*(\d[\d \u00A0.]*)(,[\d ]{1,6})?\s*(€|EUR)?\s*(-)?\s*$/

/** Lignes de synthèse qui portent un montant sans être des opérations. */
const NON_TRANSACTION = /^(solde|total|report|nouveau solde|ancien solde)\b/i

interface TrailingAmount {
  index: number
  value: number
  sign: -1 | 0 | 1
}

function matchTrailingAmount(line: string): TrailingAmount | null {
  const match = TRAILING_AMOUNT.exec(line)
  if (!match) return null

  const [full, , , decimals, currency] = match
  if (!decimals && !currency) return null

  // Une fois les espaces retirés, « -1 2,1 6 € » et « 1 234,56 € » retrouvent
  // tous deux une écriture que le lecteur de montants standard sait relire.
  const parsed = parseFrenchAmount(full.replace(/[ \u00A0]/g, '').replace(/EUR$/i, '€'))
  if (!parsed || parsed.value === 0) return null

  return { index: match.index, value: parsed.value, sign: parsed.sign }
}

function cleanLabel(raw: string, dateText: string | null): string {
  const withoutDate = dateText ? raw.replace(dateText, ' ') : raw
  return withoutDate
    .replace(/[-–|*:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Retourne la date d'une ligne voisine, une seule fois, puis la marque prise. */
function claimDate(entry: ScannedLine, claimed: Set<number>, index: number): string | null {
  if (!entry.date || claimed.has(index)) return null
  claimed.add(index)
  return entry.date
}

interface ScannedLine {
  line: string
  amount: TrailingAmount | null
  dateText: string | null
  date: string | null
}

/**
 * Découpe un texte OCR en opérations.
 *
 * Chaque opération est ancrée sur la ligne qui porte son montant. Sa date n'y
 * figure pas forcément : les applications bancaires la placent sur une ligne à
 * part, sous l'opération (« Enregistré le 2026-09-04 »), là où un relevé
 * imprimé la met en tête de ligne. On la cherche donc sur la ligne du montant,
 * puis dans les lignes suivantes jusqu'à l'opération suivante, et seulement
 * ensuite au-dessus — chaque recherche restant bornée par les opérations
 * voisines pour qu'une ligne n'emprunte jamais la date d'une autre.
 *
 * Ne retourne jamais un montant dont le signe serait deviné : sans + ni -
 * explicite dans le texte, `kind` vaut `'inconnu'` — à l'utilisateur de
 * trancher en écran de validation, jamais à l'app de choisir à sa place.
 */
export function parseStatementText(text: string, referenceYear: number): ParsedLine[] {
  const scanned: ScannedLine[] = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const dateText = DATE_TOKEN.exec(line)?.[0] ?? null
      return {
        line,
        amount: matchTrailingAmount(line),
        dateText,
        date: dateText ? parseStatementDate(dateText, referenceYear) : null,
      }
    })

  const anchors = scanned.flatMap((entry, index) => (entry.amount ? [index] : []))
  const claimed = new Set<number>()
  const results: ParsedLine[] = []

  for (const [rank, index] of anchors.entries()) {
    const entry = scanned[index]
    const amount = entry.amount!
    const previous = rank > 0 ? anchors[rank - 1] : -1
    const next = rank + 1 < anchors.length ? anchors[rank + 1] : scanned.length

    // Une ligne de date ne sert qu'une fois : les opérations étant parcourues
    // de haut en bas, celle qui la revendique la première est celle qu'elle
    // accompagne. Sans quoi une opération dont la date manque emprunterait
    // celle de sa voisine et serait datée à tort.
    let date = entry.date
    for (let j = index + 1; j < next && !date; j += 1) date = claimDate(scanned[j], claimed, j)
    for (let j = index - 1; j > previous && !date; j -= 1) date = claimDate(scanned[j], claimed, j)
    if (!date) continue

    const label = cleanLabel(entry.line.slice(0, amount.index), entry.dateText)
    if (!label || NON_TRANSACTION.test(label)) continue

    results.push({
      rawLine: entry.line,
      date,
      label,
      amount: amount.value,
      kind: amount.sign < 0 ? 'depense' : amount.sign > 0 ? 'revenu' : 'inconnu',
    })
  }

  return results
}

/** Lit une opération tenant sur une seule ligne (relevé imprimé). */
export function parseStatementLine(line: string, referenceYear: number): ParsedLine | null {
  return parseStatementText(line, referenceYear)[0] ?? null
}
