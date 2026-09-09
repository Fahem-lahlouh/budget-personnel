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
import { haptic } from '@/utils/haptics'
import { PinDots, PinPad } from '@/features/security/PinPad'
import { UNLOCK_DURATION_MS, type AppSettings, type PrivacyKey } from '@/models/types'
import '@/features/security/LockScreen.css'

/**
 * Session de déverrouillage des champs protégés (voir `PrivacyKey`).
 *
 * Indépendante du verrouillage global de l'app (`LockContext`, l'écran plein
 * écran au lancement) : on peut très bien ne pas verrouiller l'app du tout et
 * protéger uniquement le salaire. Ce contexte répond à deux questions :
 *
 * - **`isVisible(key, settings)`** : ce champ doit-il être masqué maintenant ?
 * - **`reveal(keys, settings)`** : demande le code, et si correct, retient
 *   `keys` comme déverrouillés pour la durée choisie dans les Réglages.
 *
 * Une minuterie (`30s`/`1m`/`5m`) survit à un bref passage en arrière-plan
 * (consulter un message) ; le mode `background` (par défaut) referme tout dès
 * que l'app quitte le premier plan, et `once` se referme de lui-même après une
 * brève fenêtre de consultation.
 *
 * `confirmWithPin()` sert à un usage différent : confirmer une identité avant
 * une action sensible (modifier les Réglages de confidentialité, changer le
 * PIN…) sans révéler quoi que ce soit — voir `SecurityGate`.
 */

type UnlockEntry = number | 'background'

interface PendingRequest {
  type: 'reveal' | 'confirm'
  keys: PrivacyKey[]
  resolve: (success: boolean) => void
}

interface UnlockSessionValue {
  isVisible: (key: PrivacyKey, settings: AppSettings | null) => boolean
  /** Au moins un des champs protégés donnés est actuellement masqué. */
  isAnyMasked: (keys: PrivacyKey[], settings: AppSettings | null) => boolean
  reveal: (keys: PrivacyKey[], settings: AppSettings) => Promise<boolean>
  hide: (keys?: PrivacyKey[]) => void
  /** Confirme le code sans déverrouiller de champ — pour protéger un réglage. */
  confirmWithPin: () => Promise<boolean>
  /**
   * À vérifier avant `reveal`/`confirmWithPin` : sans code configuré, ces deux
   * fonctions ne peuvent que renvoyer `false` indéfiniment (aucun code ne
   * peut jamais être « le bon »). L'appelant doit orienter l'utilisateur vers
   * la création d'un code plutôt que d'ouvrir un pavé qu'aucune saisie ne
   * satisfera jamais.
   */
  isPinConfigured: () => Promise<boolean>
}

const UnlockSessionContext = createContext<UnlockSessionValue | null>(null)

export function UnlockSessionProvider({
  settings,
  children,
}: {
  settings: AppSettings | null
  children: ReactNode
}) {
  const [unlocked, setUnlocked] = useState<Partial<Record<PrivacyKey, UnlockEntry>>>({})
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const queue = useRef<PendingRequest[]>([])

  const isVisible = useCallback(
    (key: PrivacyKey, settings: AppSettings | null): boolean => {
      if (!settings?.protectedFields[key]) return true
      const entry = unlocked[key]
      if (entry === undefined) return false
      if (entry === 'background') return true
      return Date.now() < entry
    },
    [unlocked],
  )

  const isAnyMasked = useCallback(
    (keys: PrivacyKey[], settings: AppSettings | null): boolean =>
      keys.some((key) => !isVisible(key, settings)),
    [isVisible],
  )

  const processNext = useCallback(() => {
    const next = queue.current.shift()
    setPending(next ?? null)
  }, [])

  const enqueue = useCallback(
    (request: Omit<PendingRequest, 'resolve'>): Promise<boolean> =>
      new Promise((resolve) => {
        const full: PendingRequest = { ...request, resolve }
        setPending((current) => {
          if (current) {
            queue.current.push(full)
            return current
          }
          return full
        })
      }),
    [],
  )

  const reveal = useCallback(
    (keys: PrivacyKey[], settings: AppSettings): Promise<boolean> =>
      enqueue({ type: 'reveal', keys }).then((success) => {
        if (success) {
          const duration = settings.unlockDuration
          const entry: UnlockEntry = duration === 'background' ? 'background' : Date.now() + UNLOCK_DURATION_MS[duration]
          setUnlocked((prev) => {
            const next = { ...prev }
            for (const key of keys) next[key] = entry
            return next
          })
        }
        return success
      }),
    [enqueue],
  )

  const confirmWithPin = useCallback(
    (): Promise<boolean> => enqueue({ type: 'confirm', keys: [] }),
    [enqueue],
  )

  const hide = useCallback((keys?: PrivacyKey[]) => {
    setUnlocked((prev) => {
      if (!keys) return {}
      const next = { ...prev }
      for (const key of keys) delete next[key]
      return next
    })
  }, [])

  // Un passage en arrière-plan referme tout ce qui était en mode `background`
  // — mais pas les minuteries `30s`/`1m`/`5m`, qui doivent justement survivre
  // à une brève interruption (répondre à un message, par exemple).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      setUnlocked((prev) => {
        const next: Partial<Record<PrivacyKey, UnlockEntry>> = {}
        for (const [key, value] of Object.entries(prev) as [PrivacyKey, UnlockEntry][]) {
          if (value !== 'background') next[key] = value
        }
        return next
      })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const isPinConfigured = useCallback(() => pinService.isConfigured(), [])

  const value = useMemo<UnlockSessionValue>(
    () => ({ isVisible, isAnyMasked, reveal, hide, confirmWithPin, isPinConfigured }),
    [isVisible, isAnyMasked, reveal, hide, confirmWithPin, isPinConfigured],
  )

  return (
    <UnlockSessionContext.Provider value={value}>
      {children}
      {pending ? (
        <PinPromptSheet
          key={pending.type}
          title={pending.type === 'confirm' ? 'Confirmer' : 'Entrer votre code'}
          pinLength={settings?.pinLength ?? 6}
          onResult={(success) => {
            pending.resolve(success)
            processNext()
          }}
        />
      ) : null}
    </UnlockSessionContext.Provider>
  )
}

export function useUnlockSession(): UnlockSessionValue {
  const context = useContext(UnlockSessionContext)
  if (!context) throw new Error('useUnlockSession doit être utilisé dans un UnlockSessionProvider')
  return context
}

// MARK: - Invite de code

/**
 * Petite feuille modale demandant le code PIN, pour révéler un champ ou
 * confirmer une action — distincte du `LockScreen` plein écran du lancement.
 */
function PinPromptSheet({
  title,
  pinLength,
  onResult,
}: {
  title: string
  pinLength: number
  onResult: (success: boolean) => void
}) {
  const [entry, setEntry] = useState('')
  const [error, setError] = useState(false)
  const [, setAttempts] = useState(0)
  const [lockedOutUntil, setLockedOutUntil] = useState(0)
  const [remaining, setRemaining] = useState(0)

  const isLockedOut = lockedOutUntil > Date.now()

  useEffect(() => {
    if (!isLockedOut) return
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((lockedOutUntil - Date.now()) / 1000)))
    }, 500)
    return () => window.clearInterval(id)
  }, [isLockedOut, lockedOutUntil])

  const submit = useCallback(
    async (code: string) => {
      const ok = await pinService.verify(code)
      if (ok) {
        haptic('success')
        onResult(true)
        return
      }
      haptic('error')
      setError(true)
      setEntry('')
      window.setTimeout(() => setError(false), 600)
      setAttempts((current) => {
        const next = current + 1
        if (next % 5 === 0) {
          const step = next / 5
          setLockedOutUntil(Date.now() + Math.min(300_000, 30_000 * 2 ** (step - 1)))
        }
        return next
      })
    },
    [onResult],
  )

  const append = useCallback(
    (digit: string) => {
      if (isLockedOut) return
      setEntry((current) => {
        if (current.length >= pinLength) return current
        const next = current + digit
        if (next.length === pinLength) window.setTimeout(() => void submit(next), 120)
        return next
      })
    },
    [isLockedOut, pinLength, submit],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onResult(false)
      else if (/^\d$/.test(event.key)) append(event.key)
      else if (event.key === 'Backspace') setEntry((current) => current.slice(0, -1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [append, onResult])

  return (
    <div className="lock-screen" style={{ zIndex: 500 }}>
      <button
        type="button"
        aria-label="Annuler"
        onClick={() => onResult(false)}
        style={{
          position: 'absolute',
          top: 'calc(var(--safe-top) + 16px)',
          right: 20,
          color: 'var(--text-secondary)',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Annuler
      </button>
      <div className="lock-screen__content">
        <div className="lock-screen__brand">
          <h1 className="lock-screen__title">{title}</h1>
          <p className={`lock-screen__hint ${isLockedOut ? 'is-error' : ''}`}>
            {isLockedOut
              ? `Trop de tentatives. Réessayez dans ${remaining} s.`
              : error
                ? 'Code incorrect.'
                : `Saisissez votre code à ${pinLength} chiffres`}
          </p>
        </div>
        <PinDots filled={entry.length} total={pinLength} error={error} />
        <PinPad
          disabled={isLockedOut}
          onDigit={append}
          onDelete={() => setEntry((current) => current.slice(0, -1))}
        />
      </div>
    </div>
  )
}
