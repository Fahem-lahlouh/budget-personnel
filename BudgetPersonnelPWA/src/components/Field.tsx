import { useId, type ReactNode } from 'react'
import './Field.css'

interface AmountInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  autoFocus?: boolean
  hint?: ReactNode
  /** Grand champ centré, pour le montant principal d'une dépense. */
  hero?: boolean
}

/**
 * Saisie d'un montant.
 *
 * `inputMode="decimal"` fait apparaître le pavé numérique sur iPhone tout en
 * autorisant la virgule ; `type="text"` évite les flèches et le comportement
 * capricieux de `type="number"` sur Safari. La virgule française est acceptée
 * et convertie.
 */
export function AmountInput({
  label,
  value,
  onChange,
  autoFocus = false,
  hint,
  hero = false,
}: AmountInputProps) {
  const id = useId()
  const display = value === 0 ? '' : String(value).replace('.', ',')

  return (
    <div className={`amount-input ${hero ? 'amount-input--hero' : ''}`}>
      <label className="amount-input__label" htmlFor={id}>
        {label}
      </label>
      <div className="amount-input__row">
        <input
          id={id}
          className="amount-input__field tnum"
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          autoFocus={autoFocus}
          // Le champ se dimensionne sur son contenu pour que le « € » reste
          // collé au nombre au lieu de flotter au bout d'un champ vide.
          style={hero ? { width: `${Math.max(display.length, 1)}ch` } : undefined}
          value={display}
          placeholder="0"
          onChange={(event) => {
            const raw = event.target.value.replace(/\s/g, '').replace(',', '.')
            if (raw === '') return onChange(0)
            if (!/^\d*\.?\d{0,2}$/.test(raw)) return
            const parsed = Number(raw)
            if (!Number.isNaN(parsed)) onChange(parsed)
          }}
        />
        <span className="amount-input__unit" aria-hidden="true">€</span>
      </div>
      {hint ? <div className="amount-input__hint">{hint}</div> : null}
    </div>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  autoFocus?: boolean
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  autoFocus = false,
}: TextFieldProps) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className="field__input field__input--multiline"
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className="field__input"
          type="text"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          enterKeyHint="done"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}

interface DateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function DateField({ label, value, onChange }: DateFieldProps) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field__input"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

interface SegmentedProps<T extends string> {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

/** Sélecteur segmenté, façon `UISegmentedControl`. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="field">
      {label ? <span className="field__label">{label}</span> : null}
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`segmented__option ${value === option.value ? 'is-active' : ''}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface SwitchProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId()
  return (
    <div className={`switch-row ${disabled ? 'is-disabled' : ''}`}>
      <label className="switch-row__text" htmlFor={id}>
        <span className="switch-row__label">{label}</span>
        {description ? <span className="switch-row__desc">{description}</span> : null}
      </label>
      <input
        id={id}
        className="switch"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  )
}
