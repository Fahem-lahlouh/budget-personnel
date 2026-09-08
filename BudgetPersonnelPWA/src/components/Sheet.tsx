import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from '@/design-system/Icon'
import { IconButton } from './Button'
import './Sheet.css'

interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Action de confirmation affichée en haut à droite. */
  action?: { label: string; onClick: () => void; disabled?: boolean }
  /** Feuille pleine hauteur (formulaires longs). */
  tall?: boolean
}

/**
 * Feuille modale montante, à la manière des `sheet` iOS.
 *
 * Détails qui font la différence sur iPhone :
 * - le fond de page est figé pendant l'ouverture, sinon Safari fait défiler la
 *   page derrière la feuille ;
 * - la fermeture est possible au clavier (Échap) et au tap sur le voile ;
 * - le focus part sur la feuille pour que les lecteurs d'écran suivent.
 */
export function Sheet({ open, title, onClose, children, action, tall = false }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // Fige l'arrière-plan sans faire sauter la position de défilement.
    const { body } = document
    const scrollY = window.scrollY
    const previous = body.style.cssText
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'

    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      body.style.cssText = previous
      window.scrollTo(0, scrollY)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sheet__scrim" aria-label="Fermer" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`sheet__panel ${tall ? 'sheet__panel--tall' : ''}`}
      >
        <div className="sheet__grabber" aria-hidden="true" />
        <header className="sheet__header">
          <IconButton label="Fermer" tone="neutral" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
          <h2 className="sheet__title">{title}</h2>
          {action ? (
            <button
              type="button"
              className="sheet__action"
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ) : (
            <span className="sheet__spacer" />
          )}
        </header>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}
