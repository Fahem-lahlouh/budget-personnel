import { useEffect, useRef } from 'react'
import { Button } from './Button'
import { haptic } from '@/utils/haptics'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** Ce que l'action va faire. Une phrase, au présent. */
  message?: string
  /** Conséquence à ne pas manquer, affichée en rouge. */
  warning?: string
  /** Libellé du bouton d'action. « Supprimer », « Tout effacer »… */
  confirmLabel: string
  /**
   * Une action destructive porte un bouton rouge et prévient qu'elle est
   * irréversible. Une action seulement importante (restaurer une sauvegarde)
   * garde le bouton d'accentuation.
   */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation avant une action irréversible.
 *
 * Le point d'entrée unique pour tout ce qui détruit des données, afin que la
 * question soit posée de la même façon partout — même titre, même place des
 * boutons, même code couleur. Trois formulations différentes selon l'écran
 * apprendraient à l'utilisateur à valider sans lire.
 *
 * Le focus part sur **Annuler** : sur mobile, la validation ne doit jamais
 * tomber sous le doigt qui vient de toucher le bouton d'origine, et une
 * pression sur Entrée ne doit rien détruire.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  warning,
  confirmLabel,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Gardée dans une ref pour que l'abonnement ci-dessous ne dépende que de
  // l'ouverture : `onCancel` est presque toujours une fonction anonyme, donc
  // différente à chaque rendu du parent.
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current()
    }

    // La touche Échap qui a demandé cette confirmation est encore en train de
    // se propager quand la modale se monte : s'abonner immédiatement la ferait
    // annuler par le geste même qui l'a ouverte. On attend la fin de
    // l'événement en cours.
    const timer = window.setTimeout(() => document.addEventListener('keydown', onKeyDown))

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-box">
        <h2>{title}</h2>
        {message ? <p>{message}</p> : null}
        {warning ? <p className="confirm-box__warning">{warning}</p> : null}

        <div className="confirm-box__actions">
          {/* La modale se monte à l'ouverture : `autoFocus` porte donc à
              chaque fois, sans avoir à manipuler le focus à la main. */}
          <Button autoFocus variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => {
              haptic('warning')
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
