import type { CSSProperties } from 'react'
import { useLock } from '@/app/LockContext'
import { useUnlockSession } from '@/app/UnlockSession'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { ratio } from '@/services/format'
import { haptic } from '@/utils/haptics'

/**
 * Affiche un pourcentage en respectant la confidentialité — pendant de
 * `AmountText` pour la catégorie `percentages` (« 71 % du salaire utilisé »
 * peut suffire à deviner un salaire approximatif, d'où un contrôle séparé).
 */
export function PercentText({
  value,
  className = '',
  style,
}: {
  value: number
  className?: string
  style?: CSSProperties
}) {
  const { locked } = useLock()
  const session = useUnlockSession()
  const { settings } = useData()
  const { notify } = useToast()

  const isProtected = Boolean(settings?.protectedFields.percentages)
  const masked = locked || (isProtected && !session.isVisible('percentages', settings))
  const tappable = masked && isProtected && !locked

  return (
    <span
      className={`tnum ${tappable ? 'amount--tappable' : ''} ${className}`}
      style={style}
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={
        tappable
          ? () => {
              haptic('light')
              void (async () => {
                if (!(await session.isPinConfigured())) {
                  notify('Configurez un code dans Réglages → Sécurité pour révéler ce champ', 'error')
                  return
                }
                void session.reveal(['percentages'], settings!)
              })()
            }
          : undefined
      }
      aria-label={masked ? 'Pourcentage masqué' : undefined}
    >
      {masked ? '••' : ratio(value)}
    </span>
  )
}
