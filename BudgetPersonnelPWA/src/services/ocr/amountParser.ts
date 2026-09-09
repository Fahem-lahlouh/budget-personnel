/**
 * Lecture des montants au format français reconnus dans un relevé bancaire :
 * « 25,90 € », « 1 234,56 », « -42,00 », « 3,50- » (signe parfois en suffixe).
 * Jamais de virgule décimale anglaise ni de signe implicite déduit à tort.
 */
export interface ParsedAmount {
  /** Toujours positif : la magnitude du montant. */
  value: number
  /** -1 si un signe moins est présent, +1 si un plus, 0 si aucun signe explicite. */
  sign: -1 | 0 | 1
}

/** Repère un nombre au format français dans un texte, signe optionnel avant ou après, symbole € optionnel. */
export const AMOUNT_PATTERN =
  /([+-]?)\s?(\d{1,3}(?:[ \u00A0.]\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)\s?€?\s?(-)?/g

export function parseFrenchAmount(raw: string): ParsedAmount | null {
  const match = /^\s*([+-]?)\s?(\d{1,3}(?:[ \u00A0.]\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)\s?€?\s?(-)?\s*$/.exec(
    raw,
  )
  if (!match) return null

  const [, prefixSign, digits, suffixSign] = match
  let sign: -1 | 0 | 1 = 0
  if (prefixSign === '-' || suffixSign === '-') sign = -1
  else if (prefixSign === '+') sign = 1

  // Le séparateur de milliers français est l'espace ; un point isolé ne peut
  // donc être qu'un séparateur de milliers erroné d'OCR, jamais un décimal.
  const normalized = digits.replace(/[ \u00A0.]/g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  if (!Number.isFinite(value)) return null

  return { value, sign }
}

/** Date française jj/mm ou jj/mm/aaaa (année sur 2 ou 4 chiffres) → ISO `aaaa-mm-jj`. */
export function parseFrenchDate(raw: string, referenceYear: number): string | null {
  const match = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/.exec(raw.trim())
  if (!match) return null

  const [, dayStr, monthStr, yearStr] = match
  const day = Number.parseInt(dayStr, 10)
  const month = Number.parseInt(monthStr, 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  let year = referenceYear
  if (yearStr) {
    year = yearStr.length === 2 ? 2000 + Number.parseInt(yearStr, 10) : Number.parseInt(yearStr, 10)
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
