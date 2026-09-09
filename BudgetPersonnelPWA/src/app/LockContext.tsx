import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { pinService } from '@/services/crypto'
import { isPlatformAuthenticatorAvailable, webauthnService } from '@/services/webauthn'
import type { AppSettings } from '@/models/types'

/**
 * Verrouillage global de l'application : l'écran plein écran demandé au
 * lancement et après une absence prolongée, quand « Verrouiller l'app par
 * code » est activé dans les Réglages.
 *
 * Le masquage **par champ** (salaire, montants des dépenses…) est une
 * question différente, traitée par `UnlockSession` — on peut très bien ne
 * jamais activer ce verrouillage global et protéger uniquement le salaire.
 * Tant que `locked` est vrai ici, en revanche, absolument rien n'est lisible :
 * c'est le verrou de dernier recours.
 */

interface LockState {
  locked: boolean
  failedAttempts: number
  /** Horodatage de fin de temporisation, `0` s'il n'y en a pas. */
  lockedOutUntil: number
  biometricsAvailable: boolean
  ready: boolean
}

interface LockContextValue extends LockState {
  lockEnabled: boolean
  biometricsEnabled: boolean
  isLockedOut: boolean
  submitPin: (pin: string) => Promise<boolean>
  unlockWithBiometrics: () => Promise<boolean>
  lockNow: () => void
  applySettings: (settings: AppSettings) => void
}

const LockContext = createContext<LockContextValue | null>(null)

/** Délai d'inactivité avant re-verrouillage automatique. */
const AUTO_LOCK_DELAY_MS = 2 * 60 * 1000

export function LockProvider({
  settings,
  children,
}: {
  settings: AppSettings | null
  children: ReactNode
}) {
  const [state, setState] = useState<LockState>({
    locked: false,
    failedAttempts: 0,
    lockedOutUntil: 0,
    biometricsAvailable: false,
    ready: false,
  })

  const lockEnabled = Boolean(settings?.lockEnabled)
  const biometricsEnabled = Boolean(settings?.biometricsEnabled)
  const hiddenSince = useRef<number>(0)

  // Amorçage : l'app démarre verrouillée si un code est configuré.
  useEffect(() => {
    if (!settings) return
    let cancelled = false
    void (async () => {
      const [configured, available] = await Promise.all([
        pinService.isConfigured(),
        isPlatformAuthenticatorAvailable(),
      ])
      if (cancelled) return
      setState((prev) => ({
        ...prev,
        locked: settings.lockEnabled && configured,
        biometricsAvailable: available,
        ready: true,
      }))
    })()
    return () => {
      cancelled = true
    }
    // Volontairement limité au premier chargement des réglages : `applySettings`
    // prend le relais ensuite, sans re-verrouiller l'app en pleine utilisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings !== null])

  /**
   * Reprend les réglages **sans** verrouiller : activer le code depuis l'écran
   * Réglages ne doit pas poser l'écran de saisie par-dessus les réglages en
   * cours d'utilisation. Le verrouillage prend effet au passage en arrière-plan.
   */
  const applySettings = useCallback((next: AppSettings) => {
    setState((prev) => ({ ...prev, locked: next.lockEnabled ? prev.locked : false }))
  }, [])

  const lockNow = useCallback(() => {
    setState((prev) => ({ ...prev, locked: lockEnabled ? true : prev.locked }))
  }, [lockEnabled])

  // Re-verrouillage quand l'app repasse en arrière-plan.
  //
  // `visibilitychange` est le seul signal fiable sur iOS : `blur` ne se
  // déclenche pas au passage en multitâche. Un délai de grâce évite de
  // redemander le code parce que le clavier a masqué la page une seconde.
  useEffect(() => {
    if (!lockEnabled) return

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now()
        return
      }
      const away = Date.now() - hiddenSince.current
      if (hiddenSince.current > 0 && away > AUTO_LOCK_DELAY_MS) {
        setState((prev) => ({ ...prev, locked: true }))
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [lockEnabled])

  const isLockedOut = state.lockedOutUntil > Date.now()

  const submitPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (state.lockedOutUntil > Date.now()) return false

      if (await pinService.verify(pin)) {
        setState((prev) => ({ ...prev, locked: false, failedAttempts: 0, lockedOutUntil: 0 }))
        return true
      }

      setState((prev) => {
        const failed = prev.failedAttempts + 1
        // Temporisation progressive : 5 échecs → 30 s, puis 60 s, 120 s…
        // plafonnée à 5 minutes.
        const step = Math.floor(failed / 5)
        const lockedOutUntil =
          failed % 5 === 0
            ? Date.now() + Math.min(300_000, 30_000 * 2 ** Math.max(0, step - 1))
            : prev.lockedOutUntil
        return { ...prev, failedAttempts: failed, lockedOutUntil }
      })
      return false
    },
    [state.lockedOutUntil],
  )

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    if (!biometricsEnabled || state.lockedOutUntil > Date.now()) return false
    const success = await webauthnService.authenticate()
    if (success) {
      setState((prev) => ({ ...prev, locked: false, failedAttempts: 0, lockedOutUntil: 0 }))
    }
    return success
  }, [biometricsEnabled, state.lockedOutUntil])

  const value = useMemo<LockContextValue>(
    () => ({
      ...state,
      lockEnabled,
      biometricsEnabled,
      isLockedOut,
      submitPin,
      unlockWithBiometrics,
      lockNow,
      applySettings,
    }),
    [state, lockEnabled, biometricsEnabled, isLockedOut, submitPin, unlockWithBiometrics, lockNow, applySettings],
  )

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>
}

export function useLock(): LockContextValue {
  const context = useContext(LockContext)
  if (!context) throw new Error('useLock doit être utilisé dans un LockProvider')
  return context
}
