import { useLock } from '@/app/LockContext'
import { useUnlockSession } from '@/app/UnlockSession'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { MASKED_AMOUNT, money, moneyShort, signedMoney } from '@/services/format'
import { haptic } from '@/utils/haptics'
import type { PrivacyKey } from '@/models/types'
import './AmountText.css'

/**
 * **Le seul composant qui affiche un montant.**
 *
 * Tant que tous les écrans passent par lui, il est impossible d'oublier de
 * masquer une valeur quelque part : un nouvel écran hérite automatiquement de
 * la règle de confidentialité. C'est l'endroit unique qui consulte
 * `PrivacySettings` (via `AppSettings.protectedFields`) et `UnlockSession`
 * pour décider, à chaque rendu, si un montant se montre ou reste `•••• €`.
 *
 * `privacyKey` dit **quelle catégorie** de donnée est affichée (salaire,
 * reste disponible…) ; c'est cette catégorie que les Réglages activent ou
 * désactivent indépendamment les unes des autres. `confidential` reste pour
 * compatibilité au niveau des lignes de dépense : `confidential={true}`
 * équivaut à `privacyKey="confidentialExpenses"`.
 *
 * Tant que le champ est protégé et masqué, le montant devient tapable : un
 * tap déclenche l'invite de code de `UnlockSession`. Jamais de contournement
 * silencieux — voir `UnlockSession.reveal`.
 */

type Size = 'hero' | 'tile' | 'row' | 'caption'

interface AmountTextProps {
  amount: number
  /** Catégorie de confidentialité de ce montant (mécanisme principal). */
  privacyKey?: PrivacyKey
  /** Raccourci historique : `true` ⇒ `privacyKey="confidentialExpenses"`. */
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
  privacyKey,
  confidential = false,
  size = 'row',
  signed = false,
  compact = false,
  tone = 'default',
  className = '',
}: AmountTextProps) {
  const { locked } = useLock()
  const session = useUnlockSession()
  const { settings } = useData()
  const { notify } = useToast()

  const effectiveKey: PrivacyKey | undefined =
    privacyKey ?? (confidential ? 'confidentialExpenses' : undefined)
  const isProtected = Boolean(effectiveKey && settings?.protectedFields[effectiveKey])
  const masked = locked || (isProtected && !session.isVisible(effectiveKey!, settings))
  // Sans protection déclarée sur ce champ, rien à révéler : pas d'interaction.
  const tappable = masked && isProtected && !locked

  const text = masked
    ? MASKED_AMOUNT
    : signed
      ? signedMoney(amount)
      : compact
        ? moneyShort(amount)
        : money(amount)

  const onReveal = tappable
    ? () => {
        haptic('light')
        void (async () => {
          if (!(await session.isPinConfigured())) {
            notify('Configurez un code dans Réglages → Sécurité pour révéler ce champ', 'error')
            return
          }
          void session.reveal([effectiveKey!], settings!)
        })()
      }
    : undefined

  return (
    <span
      className={`amount amount--${size} amount--${masked ? 'muted' : tone} ${tappable ? 'amount--tappable' : ''} tnum ${className}`}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={onReveal}
      onKeyDown={
        tappable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onReveal?.()
              }
            }
          : undefined
      }
      // Le lecteur d'écran ne doit pas énoncer un montant que l'écran masque.
      aria-label={masked ? (tappable ? 'Montant masqué, activer pour révéler' : 'Montant masqué') : undefined}
    >
      {text}
    </span>
  )
}

/** Indique si un montant serait masqué, pour les cas où l'affichage diffère. */
export function useIsAmountMasked(privacyKey?: PrivacyKey, confidential = false): boolean {
  const { locked } = useLock()
  const session = useUnlockSession()
  const { settings } = useData()
  const effectiveKey = privacyKey ?? (confidential ? 'confidentialExpenses' : undefined)
  const isProtected = Boolean(effectiveKey && settings?.protectedFields[effectiveKey])
  return locked || (isProtected && !session.isVisible(effectiveKey!, settings))
}
