import { useLock } from '@/app/LockContext'
import { MASKED_AMOUNT, money, moneyShort, signedMoney } from '@/services/format'
import './AmountText.css'

/**
 * **Le seul composant qui affiche un montant.**
 *
 * Tant que tous les écrans passent par lui, il est impossible d'oublier de
 * masquer une valeur quelque part : un nouvel écran hérite automatiquement de
 * la règle de confidentialité. C'est l'équivalent de `AmountText` dans l'app
 * SwiftUI, et la raison pour laquelle aucun composant ne formate un montant
 * lui-même.
 *
 * Un montant est masqué si l'app est verrouillée, ou si la dépense est marquée
 * confidentielle et que le second niveau n'a pas été ouvert.
 */

type Size = 'hero' | 'tile' | 'row' | 'caption'

interface AmountTextProps {
  amount: number
  /** La dépense d'origine est marquée « Confidentiel ». */
  confidential?: boolean
  size?: Size
  /** Affiche le signe : utilisé pour les écarts. */
  signed?: boolean
  /** Version abrégée, pour les axes de graphiques. */
  compact?: boolean
  tone?: 'default' | 'positive' | 'warning' | 'negative' | 'accent' | 'muted'
  className?: string
}

export function AmountText({
  amount,
  confidential = false,
  size = 'row',
  signed = false,
  compact = false,
  tone = 'default',
  className = '',
}: AmountTextProps) {
  const { locked, confidentialRevealed } = useLock()
  const masked = locked || (confidential && !confidentialRevealed)

  const text = masked
    ? MASKED_AMOUNT
    : signed
      ? signedMoney(amount)
      : compact
        ? moneyShort(amount)
        : money(amount)

  return (
    <span
      className={`amount amount--${size} amount--${masked ? 'muted' : tone} tnum ${className}`}
      // Le lecteur d'écran ne doit pas énoncer un montant que l'écran masque.
      aria-label={masked ? 'Montant masqué' : undefined}
    >
      {text}
    </span>
  )
}

/** Indique si un montant serait masqué, pour les cas où l'affichage diffère. */
export function useIsAmountMasked(confidential = false): boolean {
  const { locked, confidentialRevealed } = useLock()
  return locked || (confidential && !confidentialRevealed)
}
