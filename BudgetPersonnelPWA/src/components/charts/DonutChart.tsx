import { useId, useState } from 'react'
import { AmountText } from '../AmountText'
import { sliceColor } from '@/design-system/colors'
import { money, ratio } from '@/services/format'
import type { NamedTotal } from '@/services/budgetEngine'
import './charts.css'

interface DonutChartProps {
  slices: NamedTotal[]
  total: number
  /** Libellé affiché au centre quand aucun secteur n'est sélectionné. */
  centerLabel?: string
}

/**
 * Répartition en anneau.
 *
 * La légende n'est pas décorative : elle **sélectionne** le secteur
 * correspondant. Au doigt, viser une légende est bien plus fiable que viser un
 * arc de 26 px, et cela rend le graphique utilisable au clavier comme au
 * lecteur d'écran. Chaque entrée porte son libellé et sa part : l'identité ne
 * repose jamais sur la seule couleur.
 */
export function DonutChart({ slices, total, centerLabel = 'Total' }: DonutChartProps) {
  const [focused, setFocused] = useState<string | null>(null)
  const titleId = useId()

  const size = 190
  const stroke = 26
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  // Fin liseré de surface entre les secteurs : ils se lisent séparément même
  // quand deux teintes sont voisines.
  const gap = 2

  const active = focused ? slices.find((slice) => slice.name === focused) : null

  let offset = 0

  return (
    <div className="donut">
      <div className="donut__figure">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            Répartition des dépenses par catégorie.{' '}
            {slices.map((slice) => `${slice.name} ${ratio(slice.share)}`).join(', ')}
          </title>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {slices.map((slice, index) => {
              const length = Math.max(0, slice.share * circumference - gap)
              const dash = `${length} ${circumference - length}`
              const element = (
                <circle
                  key={slice.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={sliceColor(slice.id, index)}
                  strokeWidth={focused === slice.name ? stroke + 6 : stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  opacity={focused === null || focused === slice.name ? 1 : 0.32}
                  className="donut__arc"
                />
              )
              offset += slice.share * circumference
              return element
            })}
          </g>
        </svg>

        <div className="donut__center">
          <span className="donut__center-label">{active?.name ?? centerLabel}</span>
          {/* Format abrégé : le total exact ne tient pas dans le disque
              central, et il est affiché en toutes lettres dans le tableau. */}
          <AmountText amount={active?.amount ?? total} size="tile" compact />
          {active ? <span className="donut__center-share tnum">{ratio(active.share)}</span> : null}
        </div>
      </div>

      <ul className="donut__legend">
        {slices.map((slice, index) => {
          const selected = focused === slice.name
          return (
            <li key={slice.id}>
              <button
                type="button"
                className={`donut__legend-item ${selected ? 'is-active' : ''}`}
                aria-pressed={selected}
                onClick={() => setFocused(selected ? null : slice.name)}
              >
                <span
                  className="donut__swatch"
                  style={{ background: sliceColor(slice.id, index) }}
                  aria-hidden="true"
                />
                <span className="donut__legend-name">{slice.name}</span>
                <span className="donut__legend-value tnum">{ratio(slice.share)}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <details className="chart-table">
        <summary>Voir les données</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Catégorie</th>
              <th scope="col">Montant</th>
              <th scope="col">Part</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice) => (
              <tr key={slice.id}>
                <th scope="row">{slice.name}</th>
                <td className="tnum">{money(slice.amount)}</td>
                <td className="tnum">{ratio(slice.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
