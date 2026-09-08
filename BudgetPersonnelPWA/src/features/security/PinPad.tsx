import { Icon } from '@/design-system/Icon'
import { haptic } from '@/utils/haptics'
import './PinPad.css'

interface PinDotsProps {
  filled: number
  total?: number
  error?: boolean
}

export function PinDots({ filled, total = 6, error = false }: PinDotsProps) {
  return (
    <div
      className={`pin-dots ${error ? 'has-error' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`${filled} chiffre${filled > 1 ? 's' : ''} sur ${total} saisi${filled > 1 ? 's' : ''}`}
    >
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`pin-dots__dot ${index < filled ? 'is-filled' : ''}`} />
      ))}
    </div>
  )
}

interface PinPadProps {
  onDigit: (digit: string) => void
  onDelete: () => void
  /** Bouton biométrique affiché à gauche du zéro. */
  onBiometrics?: () => void
  disabled?: boolean
}

/** Pavé numérique, cibles tactiles généreuses et accessibles au clavier. */
export function PinPad({ onDigit, onDelete, onBiometrics, disabled = false }: PinPadProps) {
  return (
    <div className="pin-pad" role="group" aria-label="Pavé numérique">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button
          key={digit}
          type="button"
          className="pin-pad__key"
          disabled={disabled}
          onClick={() => {
            haptic('light')
            onDigit(digit)
          }}
        >
          {digit}
        </button>
      ))}

      {onBiometrics ? (
        <button
          type="button"
          className="pin-pad__key pin-pad__key--ghost"
          aria-label="Déverrouiller avec la biométrie"
          disabled={disabled}
          onClick={onBiometrics}
        >
          <Icon name="faceId" size={26} />
        </button>
      ) : (
        <span />
      )}

      <button
        type="button"
        className="pin-pad__key"
        disabled={disabled}
        onClick={() => {
          haptic('light')
          onDigit('0')
        }}
      >
        0
      </button>

      <button
        type="button"
        className="pin-pad__key pin-pad__key--ghost"
        aria-label="Effacer le dernier chiffre"
        disabled={disabled}
        onClick={() => {
          haptic('light')
          onDelete()
        }}
      >
        <Icon name="chevronLeft" size={24} />
      </button>
    </div>
  )
}
