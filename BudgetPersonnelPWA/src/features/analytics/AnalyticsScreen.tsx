import { useMemo, useState } from 'react'
import { useData } from '@/app/DataContext'
import { Card, EmptyState, SectionHeader } from '@/components/Card'
import { RankRow } from '@/components/Progress'
import { Segmented } from '@/components/Field'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { DonutChart } from '@/components/charts/DonutChart'
import { MonthlyBars, SalaryVsSpending, StackedShare } from '@/components/charts/BarChart'
import { Icon } from '@/design-system/Icon'
import { PAYMENT_COLORS, TYPE_COLORS, categoryColor } from '@/design-system/colors'
import { useSwipe } from '@/hooks/useSwipe'
import { summarizeMonth, summarizeYear, topWithOthers } from '@/services/budgetEngine'
import { monthName } from '@/services/format'
import { EXPENSE_TYPES, PAYMENT_STATUSES, STATUS_LABELS, TYPE_LABELS } from '@/models/types'
import { YearOverview } from '@/features/year/YearOverview'

type Scope = 'month' | 'year'

/** Onglet Analyses : les graphiques du mois, ou la synthèse annuelle. */
export function AnalyticsScreen() {
  const data = useData()
  const [scope, setScope] = useState<Scope>('month')
  const swipe = useSwipe((direction) => {
    if (scope === 'month') data.shiftPeriod(direction)
    else data.setPeriod(data.year + direction, data.month)
  })

  const monthSummary = useMemo(
    () =>
      summarizeMonth({
        expenses: data.expenses,
        recurring: data.recurring,
        budget: data.budgetFor(data.year, data.month),
        year: data.year,
        month: data.month,
        categoryName: data.categoryName,
        merchantName: data.merchantName,
      }),
    [data],
  )

  const yearSummary = useMemo(
    () =>
      summarizeYear({
        expenses: data.expenses,
        recurring: data.recurring,
        budgets: data.budgets,
        year: data.year,
        categoryName: data.categoryName,
        merchantName: data.merchantName,
      }),
    [data],
  )

  const points = yearSummary.months.map((month) => ({
    month: month.month,
    salary: month.salary,
    spent: month.total,
  }))

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === data.year && today.getMonth() + 1 === data.month

  return (
    <div className="screen" {...swipe}>
      <header className="screen__header">
        <h1 className="screen__title">Analyses</h1>
        <div style={{ marginBottom: 10 }}>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'month', label: 'Mois' },
              { value: 'year', label: 'Année' },
            ]}
          />
        </div>
        {scope === 'month' ? (
          <MonthSwitcher
            year={data.year}
            month={data.month}
            onShift={data.shiftPeriod}
            onToday={data.goToToday}
            isCurrent={isCurrentMonth}
          />
        ) : (
          <div className="month-switcher">
            <button
              type="button"
              className="icon-btn icon-btn--neutral"
              aria-label="Année précédente"
              onClick={() => data.setPeriod(data.year - 1, data.month)}
            >
              <Icon name="chevronLeft" size={18} />
            </button>
            <span className="month-switcher__month tnum">{data.year}</span>
            <button
              type="button"
              className="icon-btn icon-btn--neutral"
              aria-label="Année suivante"
              onClick={() => data.setPeriod(data.year + 1, data.month)}
            >
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
        )}
      </header>

      {scope === 'year' ? (
        <YearOverview summary={yearSummary} points={points} />
      ) : monthSummary.count === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="chart" size={26} />}
            title="Rien à analyser"
            message={`Les graphiques apparaissent dès la première dépense saisie sur ${monthName(data.month).toLowerCase()} ${data.year}.`}
          />
        </Card>
      ) : (
        <div className="stack">
          <Card>
            <div className="stack">
              <SectionHeader
                title="Répartition par catégorie"
                subtitle="Top 5, le reste regroupé sous « Autres »"
              />
              <DonutChart
                slices={topWithOthers(monthSummary.byCategory, 5)}
                total={monthSummary.total}
              />
            </div>
          </Card>

          <Card>
            <div className="stack">
              <SectionHeader title="Enseignes" subtitle="Là où vous dépensez le plus" />
              {monthSummary.byMerchant.length === 0 ? (
                <p className="chart-empty">
                  Aucune enseigne renseignée sur ce mois. Ajoutez-en une dans le détail d’une
                  dépense pour alimenter ce classement.
                </p>
              ) : (
                monthSummary.byMerchant.slice(0, 6).map((item, index) => (
                  <RankRow
                    key={item.id}
                    rank={index + 1}
                    name={item.name}
                    amount={item.amount}
                    share={item.share}
                    color={categoryColor(index)}
                  />
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="stack">
              <SectionHeader
                title="Nature des dépenses"
                subtitle="Fixe · Variable · Exceptionnelle"
              />
              <StackedShare
                segments={EXPENSE_TYPES.map((type) => ({
                  label: TYPE_LABELS[type],
                  value: monthSummary.byType[type],
                  color: TYPE_COLORS[type],
                }))}
              />
            </div>
          </Card>

          <Card>
            <div className="stack">
              <SectionHeader title="État de règlement" subtitle="Payé · À payer" />
              <StackedShare
                segments={PAYMENT_STATUSES.map((status) => ({
                  label: STATUS_LABELS[status],
                  value: monthSummary.byStatus[status],
                  color: PAYMENT_COLORS[status],
                }))}
              />
            </div>
          </Card>

          <Card>
            <div className="stack">
              <SectionHeader title="Salaire vs dépenses" subtitle={`Les 12 mois de ${data.year}`} />
              <SalaryVsSpending points={points} />
            </div>
          </Card>

          <Card>
            <div className="stack">
              <SectionHeader
                title="Évolution des dépenses"
                subtitle={`Mois par mois, ${data.year}`}
              />
              <MonthlyBars points={points} highlight={data.month} />
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
