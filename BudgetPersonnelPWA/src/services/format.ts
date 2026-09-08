/**
 * Formatage monétaire et de dates.
 *
 * Les `Intl.*Format` sont coûteux à construire : ils sont créés une fois et
 * réutilisés, sans quoi une liste qui défile en recréerait un par ligne.
 */

const LOCALE = 'fr-FR'

const currency = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyCompact = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 })

const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const longDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long' })
const weekdayDate = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Masque affiché à la place d'un montant protégé. */
export const MASKED_AMOUNT = '•••• €'

/** « 1 234,56 € » */
export function money(value: number): string {
  return currency.format(value)
}

/** « 1 235 € » — axes de graphiques et libellés serrés. */
export function moneyShort(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value / 1000)} k€`
  }
  return currencyCompact.format(value)
}

/** Montant signé, pour les écarts : « +12,00 € » / « −12,00 € ». */
export function signedMoney(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return sign + currency.format(Math.abs(value))
}

/** `0.42` → « 42 % » */
export function ratio(value: number): string {
  return percent.format(value)
}

/**
 * Convertit une date ISO `YYYY-MM-DD` en `Date` **locale**.
 *
 * `new Date('2026-09-01')` serait interprété en UTC et pourrait reculer d'un
 * jour selon le fuseau ; on passe donc par le constructeur numérique.
 */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** « 12 sept. » */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(parseISODate(iso))
}

/** « 12 septembre 2026 » */
export function formatLongDate(iso: string): string {
  return longDate.format(parseISODate(iso))
}

/** « samedi 12 septembre » — en-tête de groupe dans la liste. */
export function formatWeekday(iso: string): string {
  const label = weekdayDate.format(parseISODate(iso))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const MONTHS_SHORT = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc',
]

/** « Septembre » */
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? ''
}

/** « Sep » — axes de graphiques. */
export function monthAbbrev(month: number): string {
  return MONTHS_SHORT[month - 1] ?? ''
}

/** « Septembre 2026 » */
export function monthLabel(year: number, month: number): string {
  return `${monthName(month)} ${year}`
}

/** Accord du pluriel simple : `plural(2, 'dépense')` → « dépenses ». */
export function plural(count: number, singular: string, suffix = 's'): string {
  return count > 1 ? singular + suffix : singular
}

/** Taille lisible : « 1,4 Mo ». */
export function bytes(value: number): string {
  const units = ['o', 'ko', 'Mo', 'Go']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(size)} ${units[unit]}`
}
