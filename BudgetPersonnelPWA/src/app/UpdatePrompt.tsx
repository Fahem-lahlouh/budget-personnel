import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/Button'
import { Icon } from '@/design-system/Icon'
import './UpdatePrompt.css'

/**
 * Bandeau de mise à jour.
 *
 * `registerType: 'prompt'` : le nouveau service worker attend. L'app **ne se
 * recharge jamais toute seule** — vous pourriez être en train de saisir une
 * dépense. C'est un geste explicite qui active la nouvelle version.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Vérifie une mise à jour à chaque retour au premier plan plutôt qu'en
      // boucle : inutile de solliciter le réseau quand l'app est en arrière-plan.
      if (!registration) return
      const check = () => {
        if (document.visibilityState === 'visible') void registration.update()
      }
      document.addEventListener('visibilitychange', check)
    },
  })

  const [dismissedOffline, setDismissedOffline] = useState(false)

  useEffect(() => {
    if (!offlineReady || dismissedOffline) return
    const id = window.setTimeout(() => {
      setOfflineReady(false)
      setDismissedOffline(true)
    }, 4000)
    return () => window.clearTimeout(id)
  }, [offlineReady, dismissedOffline, setOfflineReady])

  if (needRefresh) {
    return (
      <div className="update-prompt" role="status">
        <Icon name="refresh" size={18} />
        <span className="update-prompt__text">Une nouvelle version est disponible.</span>
        <Button variant="soft" onClick={() => void updateServiceWorker(true)}>
          Mettre à jour
        </Button>
        <button
          type="button"
          className="update-prompt__close"
          aria-label="Plus tard"
          onClick={() => setNeedRefresh(false)}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="update-prompt update-prompt--info" role="status">
        <Icon name="check" size={18} />
        <span className="update-prompt__text">Prête à fonctionner hors ligne.</span>
      </div>
    )
  }

  return null
}
