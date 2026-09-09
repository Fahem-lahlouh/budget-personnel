import { useCallback, useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { pinService } from '@/services/crypto'
import { haptic } from '@/utils/haptics'
import type { PinLength } from '@/models/types'
import { PinDots, PinPad } from './PinPad'
import './LockScreen.css'

type Step = 'current' | 'new' | 'confirm'

interface PinSetupSheetProps {
  open: boolean
  /** « change » demande l'ancien code avant d'en définir un nouveau. */
  mode: 'create' | 'change'
  /** Longueur du code **actuel**, pour l'étape « current » en mode change. */
  currentLength: PinLength
  /** Longueur du **nouveau** code à définir (peut différer de l'actuel). */
  newLength: PinLength
  onClose: () => void
  onDone: () => void
}

/**
 * Création ou modification du code.
 *
 * En mode « change », l'ancien code est exigé d'abord : sans cela, quelqu'un
 * qui trouve l'app déjà déverrouillée pourrait redéfinir le code à sa guise.
 * Les deux longueurs sont indépendantes : passer de 6 à 4 chiffres demande
 * l'ancien code à 6 chiffres, puis le nouveau à 4.
 */
export function PinSetupSheet({
  open,
  mode,
  currentLength,
  newLength,
  onClose,
  onDone,
}: PinSetupSheetProps) {
  const [step, setStep] = useState<Step>(mode === 'change' ? 'current' : 'new')
  const [entry, setEntry] = useState('')
  const [first, setFirst] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(mode === 'change' ? 'current' : 'new')
    setEntry('')
    setFirst('')
    setMessage(null)
    setError(false)
  }, [open, mode])

  const fail = useCallback((text: string) => {
    haptic('error')
    setMessage(text)
    setError(true)
    setEntry('')
    window.setTimeout(() => setError(false), 600)
  }, [])

  const advance = useCallback(
    async (code: string) => {
      if (step === 'current') {
        if (await pinService.verify(code)) {
          setEntry('')
          setMessage(null)
          setStep('new')
        } else {
          fail('Code actuel incorrect.')
        }
        return
      }

      if (step === 'new') {
        setFirst(code)
        setEntry('')
        setMessage(null)
        setStep('confirm')
        return
      }

      if (code !== first) {
        setFirst('')
        setStep('new')
        fail('Les deux codes ne correspondent pas.')
        return
      }

      await pinService.setPin(code)
      haptic('success')
      onDone()
      onClose()
    },
    [step, first, fail, onDone, onClose],
  )

  const activeLength = step === 'current' ? currentLength : newLength

  const append = useCallback(
    (digit: string) => {
      setEntry((current) => {
        if (current.length >= activeLength) return current
        const next = current + digit
        if (next.length === activeLength) window.setTimeout(() => void advance(next), 120)
        return next
      })
    },
    [advance, activeLength],
  )

  const titles: Record<Step, string> = {
    current: 'Code actuel',
    new: 'Nouveau code',
    confirm: 'Confirmez le code',
  }

  const hints: Record<Step, string> = {
    current: `Saisissez votre code actuel à ${currentLength} chiffres.`,
    new: `Choisissez un code à ${newLength} chiffres.`,
    confirm: 'Saisissez-le une seconde fois.',
  }

  return (
    <Sheet open={open} title={titles[step]} onClose={onClose} tall>
      <div className="lock-screen__content" style={{ padding: '20px 0' }}>
        <p className={`lock-screen__hint ${error ? 'is-error' : ''}`}>
          {message ?? hints[step]}
        </p>
        <PinDots filled={entry.length} total={activeLength} error={error} />
        <PinPad onDigit={append} onDelete={() => setEntry((current) => current.slice(0, -1))} />
      </div>
    </Sheet>
  )
}
