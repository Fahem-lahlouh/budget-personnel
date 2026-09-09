import { useCallback, useEffect, useState } from 'react'
import { useLock } from '@/app/LockContext'
import { useData } from '@/app/DataContext'
import { Icon } from '@/design-system/Icon'
import { haptic } from '@/utils/haptics'
import { PinDots, PinPad } from './PinPad'
import './LockScreen.css'

/**
 * Écran de verrouillage, posé par-dessus toute l'application.
 *
 * Il est opaque : c'est aussi ce qui empêche les montants d'apparaître dans la
 * vignette du sélecteur d'applications d'iOS.
 */
export function LockScreen() {
  const lock = useLock()
  const { settings } = useData()
  const pinLength = settings?.pinLength ?? 6
  const [entry, setEntry] = useState('')
  const [error, setError] = useState(false)
  const [remaining, setRemaining] = useState(0)

  // Compte à rebours de la temporisation après échecs répétés.
  useEffect(() => {
    if (!lock.isLockedOut) {
      setRemaining(0)
      return
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((lock.lockedOutUntil - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [lock.isLockedOut, lock.lockedOutUntil])

  const submit = useCallback(
    async (code: string) => {
      const success = await lock.submitPin(code)
      if (success) {
        haptic('success')
        setEntry('')
        setError(false)
        return
      }
      haptic('error')
      setError(true)
      setEntry('')
      window.setTimeout(() => setError(false), 600)
    },
    [lock],
  )

  const append = useCallback(
    (digit: string) => {
      if (lock.isLockedOut) return
      setEntry((current) => {
        if (current.length >= pinLength) return current
        const next = current + digit
        if (next.length === pinLength) {
          // Laisse le dernier point s'afficher avant de valider.
          window.setTimeout(() => void submit(next), 120)
        }
        return next
      })
    },
    [lock.isLockedOut, pinLength, submit],
  )

  // Saisie au clavier physique, pour l'usage sur ordinateur.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) append(event.key)
      else if (event.key === 'Backspace') setEntry((current) => current.slice(0, -1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [append])

  // La biométrie est proposée d'emblée : c'est le chemin le plus rapide.
  useEffect(() => {
    if (lock.biometricsEnabled && lock.biometricsAvailable) {
      void lock.unlockWithBiometrics()
    }
    // Au montage uniquement : relancer Face ID à chaque rendu serait pénible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="lock-screen">
      <div className="lock-screen__content">
        <div className="lock-screen__brand">
          <span className="lock-screen__badge">
            <Icon name="shield" size={30} />
          </span>
          <h1 className="lock-screen__title">Budget Personnel</h1>
          <p className={`lock-screen__hint ${lock.isLockedOut ? 'is-error' : ''}`}>
            {lock.isLockedOut
              ? `Trop de tentatives. Réessayez dans ${remaining} s.`
              : error
                ? 'Code incorrect.'
                : `Saisissez votre code à ${pinLength} chiffres`}
          </p>
        </div>

        <PinDots filled={entry.length} total={pinLength} error={error} />

        <PinPad
          disabled={lock.isLockedOut}
          onDigit={append}
          onDelete={() => setEntry((current) => current.slice(0, -1))}
          onBiometrics={
            lock.biometricsEnabled && lock.biometricsAvailable
              ? () => void lock.unlockWithBiometrics()
              : undefined
          }
        />
      </div>
    </div>
  )
}
