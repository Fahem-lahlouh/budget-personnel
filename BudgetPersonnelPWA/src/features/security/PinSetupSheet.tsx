import { useCallback, useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { pinService } from '@/services/crypto'
import { haptic } from '@/utils/haptics'
import { PinDots, PinPad } from './PinPad'
import './LockScreen.css'

type Step = 'current' | 'new' | 'confirm'

interface PinSetupSheetProps {
  open: boolean
  /** « change » demande l'ancien code avant d'en définir un nouveau. */
  mode: 'create' | 'change'
  onClose: () => void
  onDone: () => void
}

/**
 * Création ou modification du code.
 *
 * En mode « change », l'ancien code est exigé d'abord : sans cela, quelqu'un
 * qui trouve l'app déjà déverrouillée pourrait redéfinir le code à sa guise.
 */
export function PinSetupSheet({ open, mode, onClose, onDone }: PinSetupSheetProps) {
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

  const append = useCallback(
    (digit: string) => {
      setEntry((current) => {
        if (current.length >= 6) return current
        const next = current + digit
        if (next.length === 6) window.setTimeout(() => void advance(next), 120)
        return next
      })
    },
    [advance],
  )

  const titles: Record<Step, string> = {
    current: 'Code actuel',
    new: 'Nouveau code',
    confirm: 'Confirmez le code',
  }

  const hints: Record<Step, string> = {
    current: 'Saisissez votre code actuel pour continuer.',
    new: 'Choisissez un code à 6 chiffres.',
    confirm: 'Saisissez-le une seconde fois.',
  }

  return (
    <Sheet open={open} title={titles[step]} onClose={onClose} tall>
      <div className="lock-screen__content" style={{ padding: '20px 0' }}>
        <p className={`lock-screen__hint ${error ? 'is-error' : ''}`}>
          {message ?? hints[step]}
        </p>
        <PinDots filled={entry.length} error={error} />
        <PinPad onDigit={append} onDelete={() => setEntry((current) => current.slice(0, -1))} />
      </div>
    </Sheet>
  )
}
