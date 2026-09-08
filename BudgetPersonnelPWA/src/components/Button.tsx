import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { haptic } from '@/utils/haptics'
import './Button.css'

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
  block?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  icon,
  block = false,
  children,
  className = '',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} ${block ? 'btn--block' : ''} ${className}`}
      onClick={(event) => {
        haptic('light')
        onClick?.(event)
      }}
      {...rest}
    >
      {icon}
      {children ? <span>{children}</span> : null}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  tone?: 'accent' | 'neutral'
}

/** Bouton rond icône seule. `label` est obligatoire : il devient le nom accessible. */
export function IconButton({
  label,
  children,
  tone = 'accent',
  className = '',
  onClick,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-btn icon-btn--${tone} ${className}`}
      onClick={(event) => {
        haptic('light')
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
