import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AmountText } from './AmountText'
import { PercentText } from './PercentText'
import { ratio } from '@/services/format'
import './Progress.css'

/** Respecte « Réduire les animations » : les valeurs se posent sans transition. */
function useAnimatedValue(target: number, enabled = true): number {
  const [value, setValue] = useState(enabled ? 0 : target)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (!enabled || reduced.current) {
      setValue(target)
      return
    }
    // Un tick suffit : la transition CSS fait le reste.
    const id = window.requestAnimationFrame(() => setValue(target))
    return () => window.cancelAnimationFrame(id)
  }, [target, enabled])

  return value
}

interface ProgressBarProps {
  /** Valeur entre 0 et 1. */
  value: number
  tone?: string
  height?: number
}

export function ProgressBar({ value, tone = 'var(--accent)', height = 6 }: ProgressBarProps) {
  const animated = useAnimatedValue(value)
  return (
    <div className="progress" style={{ height }} aria-hidden="true">
      <div
        className="progress__fill"
        style={{ width: `${Math.max(0, Math.min(1, animated)) * 100}%`, background: tone }}
      />
    </div>
  )
}

interface BudgetRingProps {
  /** Part du budget consommée (`1` = 100 %). Peut dépasser 1. */
  consumption: number
  spent: number
  caption: string
  size?: number
}

/**
 * Anneau de consommation du budget.
 *
 * Seuils demandés : vert sous 80 %, orange de 80 à 100 %, rouge au-delà. Le
 * dépassement se lit sur un second arc plus fin superposé, pour que l'anneau
 * principal ne « reboucle » pas silencieusement.
 */
export function BudgetRing({ consumption, spent, caption, size = 206 }: BudgetRingProps) {
  const stroke = 15
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const animated = useAnimatedValue(consumption)

  const clamped = Math.min(animated, 1)
  const overflow = Math.max(0, Math.min(animated - 1, 1))

  const tone =
    consumption > 1 ? 'var(--negative)' : consumption >= 0.8 ? 'var(--warning)' : 'var(--positive)'

  return (
    <div
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Consommation du budget : ${ratio(consumption)} du salaire utilisé`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="ring__rail"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="ring__arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          stroke={tone}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
        {overflow > 0 ? (
          <circle
            className="ring__arc ring__arc--overflow"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke * 0.42}
            stroke="var(--negative)"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - overflow)}
          />
        ) : null}
      </svg>

      <div className="ring__center">
        <div className="ring__percent">
          <PercentText value={consumption} style={{ color: tone }} />
        </div>
        {/* Abrégé : « 2 118 € » tient dans l'anneau, « 2 118,18 € » non.
            Le montant exact est juste en dessous, dans la tuile « Total dépensé ». */}
        <AmountText amount={spent} privacyKey="totalSpent" size="hero" compact />
        <div className="ring__caption">{caption}</div>
      </div>
    </div>
  )
}

interface RankRowProps {
  rank: number
  name: string
  amount: number
  share: number
  color: string
  icon?: ReactNode
  privacyKey?: 'expenseAmounts' | 'totalSpent'
}

/** Ligne de classement : pastille, libellé, montant, barre de progression. */
export function RankRow({
  rank,
  name,
  amount,
  share,
  color,
  icon,
  privacyKey = 'expenseAmounts',
}: RankRowProps) {
  return (
    <div className="rank-row">
      <div className="rank-row__top">
        <span
          className="rank-row__badge"
          style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
          aria-hidden="true"
        >
          {icon ?? rank}
        </span>
        <span className="rank-row__name">{name}</span>
        <span className="rank-row__values">
          <AmountText amount={amount} privacyKey={privacyKey} size="row" />
          <PercentText value={share} className="rank-row__share" />
        </span>
      </div>
      <ProgressBar value={share} tone={color} />
    </div>
  )
}
