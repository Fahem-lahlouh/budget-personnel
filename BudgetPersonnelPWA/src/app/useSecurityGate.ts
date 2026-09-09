import { useCallback } from 'react'
import { useUnlockSession } from './UnlockSession'
import { pinService } from '@/services/crypto'

/**
 * Protège une action de réglages sensible (item 7 du cahier des charges) :
 * modifier les catégories protégées, changer ou désactiver le code, changer
 * sa longueur, modifier la durée de session, réinitialiser ou effacer les
 * données, importer une sauvegarde.
 *
 * Sans code configuré, il n'y a rien à confirmer : la garde s'efface
 * silencieusement (`true`). Avec un code, elle interrompt l'action tant que
 * le code n'a pas été ressaisi — **y compris si une session de révélation de
 * champ est déjà ouverte** : révéler un montant et pouvoir désactiver la
 * protection qui le couvre sont deux autorisations différentes.
 */
export function useSecurityGate() {
  const session = useUnlockSession()

  return useCallback(async (): Promise<boolean> => {
    const configured = await pinService.isConfigured()
    if (!configured) return true
    return session.confirmWithPin()
  }, [session])
}
