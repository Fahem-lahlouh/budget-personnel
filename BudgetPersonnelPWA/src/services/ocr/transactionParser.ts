import { parseFrenchAmount, parseFrenchDate } from './amountParser'
import type { TransactionKind } from '@/models/import'

export interface ParsedLine {
  rawLine: string
  date: string
  label: string
  /** Toujours positif : le sens (dépense/revenu) est porté par `kind`. */
  amount: number
  kind: TransactionKind
}

const DATE_TOKEN = /\d{2}\/\d{2}(?:\/\d{2,4})?/

/**
 * Reconnaît, dans une ligne de relevé, la date (début de ligne le plus souvent)
 * et le dernier nombre au format monétaire (le montant termine généralement la
 * ligne ; les codes de magasin, eux, apparaissent avant le libellé). Le texte
 * entre les deux est le libellé de l'opération.
 *
 * Ne retourne jamais un montant dont le signe serait deviné : sans + ni -
 * explicite dans le texte, `kind` vaut `'inconnu'` — à l'utilisateur de
 * trancher en écran de validation, jamais à l'app de choisir à sa place.
 */
export function parseStatementLine(line: string, referenceYear: number): ParsedLine | null {
  const trimmed = line.trim()
  if (trimmed.length < 6) return null

  const dateMatch = DATE_TOKEN.exec(trimmed)
  if (!dateMatch) return null
  const date = parseFrenchDate(dateMatch[0], referenceYear)
  if (!date) return null

  // Tous les nombres à la française présents après la date : le dernier est
  // le montant de l'opération (le solde courant, s'il est imprimé, précède
  // rarement le montant sur la même ligne dans les relevés mobiles).
  const rest = trimmed.slice(dateMatch.index + dateMatch[0].length)
  // Un groupe de milliers ne compte jamais que trois chiffres : contrairement à
  // une classe de caractères non bornée, ce motif ne peut pas avaler un nombre
  // isolé (ex. un code de magasin) et le signe qui suit réellement le montant.
  const numberTokens = [...rest.matchAll(/[+-]?\s?\d{1,3}(?:[ \u00A0.]\d{3})*(?:,\d{2})?\s?€?-?/g)]
    .map((match) => match[0].trim())
    .filter((token) => /\d/.test(token))
  if (numberTokens.length === 0) return null

  const amountToken = numberTokens[numberTokens.length - 1]
  const parsedAmount = parseFrenchAmount(amountToken.replace(/€/g, '').trim())
  if (!parsedAmount || parsedAmount.value === 0) return null

  const amountIndex = rest.lastIndexOf(amountToken)
  const label = rest
    .slice(0, amountIndex)
    .replace(/[-–|*]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!label) return null

  const kind: TransactionKind =
    parsedAmount.sign < 0 ? 'depense' : parsedAmount.sign > 0 ? 'revenu' : 'inconnu'

  return { rawLine: trimmed, date, label, amount: parsedAmount.value, kind }
}

/** Découpe un texte OCR brut en lignes candidates, en ignorant celles sans opération reconnaissable. */
export function parseStatementText(text: string, referenceYear: number): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => parseStatementLine(line, referenceYear))
    .filter((line): line is ParsedLine => line !== null)
}
