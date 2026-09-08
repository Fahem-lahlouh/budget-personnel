import { useId, useState } from 'react'
import { money, moneyShort, monthAbbrev } from '@/services/format'
import './charts.css'

export interface MonthPoint {
  month: number
  salary: number
  spent: number
}

interface MonthlyBarsProps {
  points: MonthPoint[]
  /** Mois mis en avant (celui qui est affiché ailleurs à l'écran). */
  highlight?: number
}

/**
 * Évolution des dépenses, mois par mois.
 *
 * Une seule série : pas de légende, le titre de la carte la nomme. Toucher une
 * barre affiche sa valeur, plutôt que d'imprimer un nombre sur chacune.
 */
export function MonthlyBars({ points, highlight }: MonthlyBarsProps) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...points.map((p) => p.spent), 1)
  const titleId = useId()

  return (
    <div className="bars">
      <div className="bars__plot" role="group" aria-labelledby={titleId}>
        <span id={titleId} className="sr-only">
          Dépenses mois par mois.{' '}
          {points
            .filter((p) => p.spent > 0)
            .map((p) => `${monthAbbrev(p.month)} ${money(p.spent)}`)
            .join(', ')}
        </span>

        {points.map((point) => {
          const height = (point.spent / max) * 100
          const isActive = active === point.month
          return (
            <button
              key={point.month}
              type="button"
              className={`bars__col ${isActive ? 'is-active' : ''}`}
              aria-label={`${monthAbbrev(point.month)} : ${money(point.spent)}`}
              onClick={() => setActive(isActive ? null : point.month)}
            >
              <span className="bars__value tnum" aria-hidden="true">
                {isActive ? moneyShort(point.spent) : ''}
              </span>
              <span className="bars__track">
                <span
                  className={`bars__bar ${point.month === highlight ? 'is-highlight' : ''}`}
                  style={{ height: `${point.spent > 0 ? Math.max(height, 3) : 0}%` }}
                />
              </span>
              <span className="bars__label">{monthAbbrev(point.month)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Salaire et dépenses côte à côte.
 *
 * Deux séries sur **une seule échelle** : jamais deux axes verticaux, qui
 * laisseraient croire à des ordres de grandeur comparables.
 */
export function SalaryVsSpending({ points }: { points: MonthPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...points.flatMap((p) => [p.salary, p.spent]), 1)
  const titleId = useId()
  const shown = points.filter((point) => point.salary > 0 || point.spent > 0)

  if (shown.length === 0) {
    return <p className="chart-empty">Aucun salaire ni dépense saisi sur cette année.</p>
  }

  return (
    <div className="bars">
      <ul className="chart-legend">
        <li>
          <span className="chart-legend__swatch" style={{ background: 'var(--cat-1)' }} />
          Salaire
        </li>
        <li>
          <span className="chart-legend__swatch" style={{ background: 'var(--cat-4)' }} />
          Dépenses
        </li>
      </ul>

      <div className="bars__plot" role="group" aria-labelledby={titleId}>
        <span id={titleId} className="sr-only">
          Salaire et dépenses par mois.{' '}
          {shown
            .map(
              (p) =>
                `${monthAbbrev(p.month)} : salaire ${money(p.salary)}, dépenses ${money(p.spent)}`,
            )
            .join('. ')}
        </span>

        {points.map((point) => {
          const isActive = active === point.month
          return (
            <button
              key={point.month}
              type="button"
              className={`bars__col ${isActive ? 'is-active' : ''}`}
              aria-label={`${monthAbbrev(point.month)} : salaire ${money(point.salary)}, dépenses ${money(point.spent)}`}
              onClick={() => setActive(isActive ? null : point.month)}
            >
              <span className="bars__value tnum" aria-hidden="true">
                {isActive ? moneyShort(point.spent) : ''}
              </span>
              <span className="bars__track bars__track--pair">
                <span
                  className="bars__bar bars__bar--thin"
                  style={{
                    height: `${(point.salary / max) * 100}%`,
                    background: 'var(--cat-1)',
                  }}
                />
                <span
                  className="bars__bar bars__bar--thin"
                  style={{
                    height: `${(point.spent / max) * 100}%`,
                    background: 'var(--cat-4)',
                  }}
                />
              </span>
              <span className="bars__label">{monthAbbrev(point.month)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface Segment {
  label: string
  value: number
  color: string
}

/** Répartition en une barre empilée, avec sa légende chiffrée. */
export function StackedShare({ segments }: { segments: Segment[] }) {
  const visible = segments.filter((segment) => segment.value > 0)
  const total = visible.reduce((sum, segment) => sum + segment.value, 0)

  if (total === 0) {
    return <p className="chart-empty">Rien à répartir sur cette période.</p>
  }

  return (
    <div className="stacked">
      <div
        className="stacked__track"
        role="img"
        aria-label={visible.map((s) => `${s.label} ${money(s.value)}`).join(', ')}
      >
        {visible.map((segment) => (
          <span
            key={segment.label}
            className="stacked__segment"
            style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
          />
        ))}
      </div>

      <ul className="stacked__legend">
        {visible.map((segment) => (
          <li key={segment.label}>
            <span className="chart-legend__swatch" style={{ background: segment.color }} />
            <span className="stacked__legend-label">{segment.label}</span>
            <span className="stacked__legend-share tnum">
              {Math.round((segment.value / total) * 100)} %
            </span>
            <span className="stacked__legend-value tnum">{money(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
