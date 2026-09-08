import { Card, EmptyState, SectionHeader } from '@/components/Card'
import { AmountText } from '@/components/AmountText'
import { ProgressBar, RankRow } from '@/components/Progress'
import { DonutChart } from '@/components/charts/DonutChart'
import { MonthlyBars, SalaryVsSpending, StackedShare } from '@/components/charts/BarChart'
import type { MonthPoint } from '@/components/charts/BarChart'
import { Icon } from '@/design-system/Icon'
import { PAYMENT_COLORS, TYPE_COLORS, categoryColor } from '@/design-system/colors'
import { topWithOthers, type YearSummary } from '@/services/budgetEngine'
import { monthName, ratio } from '@/services/format'
import { EXPENSE_TYPES, PAYMENT_STATUSES, STATUS_LABELS, TYPE_LABELS } from '@/models/types'
import './Year.css'

interface YearOverviewProps {
  summary: YearSummary
  points: MonthPoint[]
}

/**
 * Synthèse annuelle : les mêmes indicateurs qu'un mois, mais cumulés sur douze
 * mois, plus le détail mois par mois repris du tableau de bord du classeur.
 */
export function YearOverview({ summary, points }: YearOverviewProps) {
  if (summary.count === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="calendar" size={26} />}
          title={`Aucune donnée en ${summary.year}`}
          message="Saisissez des dépenses sur l’un des mois de l’année pour voir la synthèse annuelle."
        />
      </Card>
    )
  }

  return (
    <div className="stack">
      <div className="grid-2">
        <Card>
          <YearTile
            icon="euro"
            tone="accent"
            label="Revenus cumulés"
            value={<AmountText amount={summary.salary} size="tile" tone="accent" />}
            hint="12 mois cumulés"
          />
        </Card>
        <Card>
          <YearTile
            icon="arrowDownRight"
            tone="negative"
            label="Dépenses annuelles"
            value={<AmountText amount={summary.total} size="tile" tone="negative" />}
            hint={summary.salary > 0 ? `${ratio(summary.consumption)} des revenus` : undefined}
          />
        </Card>
        <Card>
          <YearTile
            icon="wallet"
            tone="positive"
            label="Épargne annuelle"
            value={<AmountText amount={summary.realSavings} size="tile" tone="positive" />}
            hint={
              summary.salary > 0 ? `${ratio(summary.realSavings / summary.salary)} des revenus` : undefined
            }
          />
        </Card>
        <Card>
          <YearTile
            icon="calendar"
            tone="warning"
            label="Moyenne / mois"
            value={<AmountText amount={summary.monthlyAverage} size="tile" />}
            hint="Sur les mois renseignés"
          />
        </Card>
        <Card>
          <YearTile
            icon="trophy"
            tone="warning"
            label="Mois le plus dépensier"
            value={
              <span className="year-tile__text">
                {summary.busiestMonth ? monthName(summary.busiestMonth.month) : '—'}
              </span>
            }
            hint={summary.busiestMonth ? 'Dépenses les plus élevées' : undefined}
          />
        </Card>
        <Card>
          <YearTile
            icon="shield"
            tone="positive"
            label="Meilleur mois"
            value={
              <span className="year-tile__text">
                {summary.bestMonth ? monthName(summary.bestMonth.month) : '—'}
              </span>
            }
            hint={summary.bestMonth ? 'Le plus d’argent restant' : undefined}
          />
        </Card>
      </div>

      <Card>
        <div className="stack">
          <SectionHeader title="Évolution des dépenses" subtitle={`Les 12 mois de ${summary.year}`} />
          <MonthlyBars points={points} />
        </div>
      </Card>

      <Card>
        <div className="stack">
          <SectionHeader title="Salaire vs dépenses" subtitle="Mois par mois" />
          <SalaryVsSpending points={points} />
        </div>
      </Card>

      <Card>
        <div className="stack">
          <SectionHeader title="Répartition par catégorie" subtitle="Cumul annuel" />
          <DonutChart slices={topWithOthers(summary.byCategory, 5)} total={summary.total} />
        </div>
      </Card>

      {summary.byMerchant.length > 0 ? (
        <Card>
          <div className="stack">
            <SectionHeader title="Enseignes" subtitle="Cumul annuel" />
            {summary.byMerchant.slice(0, 8).map((item, index) => (
              <RankRow
                key={item.id}
                rank={index + 1}
                name={item.name}
                amount={item.amount}
                share={item.share}
                color={categoryColor(index)}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="stack">
          <SectionHeader title="Nature des dépenses" subtitle="Cumul annuel" />
          <StackedShare
            segments={EXPENSE_TYPES.map((type) => ({
              label: TYPE_LABELS[type],
              value: summary.byType[type],
              color: TYPE_COLORS[type],
            }))}
          />
        </div>
      </Card>

      <Card>
        <div className="stack">
          <SectionHeader title="État de règlement" subtitle="Cumul annuel" />
          <StackedShare
            segments={PAYMENT_STATUSES.map((status) => ({
              label: STATUS_LABELS[status],
              value: summary.byStatus[status],
              color: PAYMENT_COLORS[status],
            }))}
          />
        </div>
      </Card>

      <Card flush>
        <div className="year-detail__head">
          <SectionHeader title="Détail mensuel" subtitle="Dépenses et part du salaire" />
        </div>
        <ul className="list-rows">
          {summary.months.map((month) => (
            <li key={month.month} className="year-detail__row">
              <span className="year-detail__month">{monthName(month.month)}</span>
              {month.total > 0 ? (
                <span className="year-detail__bar">
                  <ProgressBar
                    value={month.consumption}
                    tone={
                      month.consumption > 1
                        ? 'var(--negative)'
                        : month.consumption >= 0.8
                          ? 'var(--warning)'
                          : 'var(--positive)'
                    }
                  />
                </span>
              ) : (
                <span className="year-detail__empty">Aucune dépense</span>
              )}
              <AmountText amount={month.total} size="caption" tone="muted" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function YearTile({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: string
  tone: 'accent' | 'positive' | 'warning' | 'negative'
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="kpi">
      <div className="kpi__head">
        <span className={`kpi__icon kpi__icon--${tone}`}>
          <Icon name={icon} size={15} />
        </span>
        <span className="kpi__label">{label}</span>
      </div>
      <div className="kpi__value">{value}</div>
      {hint ? <div className="kpi__hint">{hint}</div> : null}
    </div>
  )
}
