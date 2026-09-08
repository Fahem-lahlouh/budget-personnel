import { useMemo, useState } from 'react'
import { useData } from '@/app/DataContext'
import { useLock } from '@/app/LockContext'
import { Card, EmptyState, SectionHeader } from '@/components/Card'
import { AmountText } from '@/components/AmountText'
import { Button, IconButton } from '@/components/Button'
import { BudgetRing, ProgressBar, RankRow } from '@/components/Progress'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { Icon } from '@/design-system/Icon'
import { categoryColor } from '@/design-system/colors'
import { useSwipe } from '@/hooks/useSwipe'
import { adviceFor, recurringStatuses, summarizeMonth } from '@/services/budgetEngine'
import { money, monthName, plural, ratio } from '@/services/format'
import { MonthBudgetSheet } from './MonthBudgetSheet'
import { RecurringReminder } from './RecurringReminder'
import './Dashboard.css'

interface DashboardScreenProps {
  onAddExpense: () => void
  onAddFromRecurring: (recurringId: string) => void
  onOpenYear: () => void
}

/** Tableau de bord mensuel — écran d'accueil. */
export function DashboardScreen({
  onAddExpense,
  onAddFromRecurring,
  onOpenYear,
}: DashboardScreenProps) {
  const data = useData()
  const lock = useLock()
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false)

  const swipe = useSwipe((direction) => data.shiftPeriod(direction))

  const summary = useMemo(
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

  const pending = useMemo(
    () =>
      recurringStatuses({
        expenses: data.expenses,
        recurring: data.recurring,
        year: data.year,
        month: data.month,
      }).filter((status) => status.needsAttention),
    [data],
  )

  const advice = useMemo(() => adviceFor(summary), [summary])

  const today = new Date()
  const isCurrentMonth =
    today.getFullYear() === data.year && today.getMonth() + 1 === data.month

  return (
    <div className="screen" {...swipe}>
      <header className="screen__header">
        <div className="dashboard__topline">
          {/* Pas de sous-titre : le sélecteur juste en dessous porte déjà le mois. */}
          <h1 className="screen__title">Budget</h1>
          <div className="dashboard__actions">
            <IconButton label={`Vue annuelle ${data.year}`} tone="neutral" onClick={onOpenYear}>
              <Icon name="calendar" size={19} />
            </IconButton>
            <IconButton
              label={
                lock.confidentialRevealed
                  ? 'Masquer les dépenses confidentielles'
                  : 'Afficher les dépenses confidentielles'
              }
              tone="neutral"
              onClick={() => {
                if (lock.confidentialRevealed) lock.hideConfidential()
                else void lock.revealConfidential()
              }}
            >
              <Icon name={lock.confidentialRevealed ? 'eye' : 'eyeOff'} size={19} />
            </IconButton>
          </div>
        </div>
        <MonthSwitcher
          year={data.year}
          month={data.month}
          onShift={data.shiftPeriod}
          onToday={data.goToToday}
          isCurrent={isCurrentMonth}
        />
      </header>

      <div className="stack">
        {/* Carte principale : anneau + salaire / reste */}
        <Card>
          <div className="dashboard__hero">
            <BudgetRing
              consumption={summary.consumption}
              spent={summary.total}
              caption={
                summary.salary > 0
                  ? `dépensés sur ${lock.locked ? '••••' : money(summary.salary)}`
                  : 'dépensés ce mois-ci'
              }
            />

            <div className="dashboard__hero-stats">
              <div className="dashboard__stat">
                <span className="dashboard__stat-label">Salaire</span>
                <AmountText amount={summary.salary} size="row" tone="accent" />
              </div>
              <div className="dashboard__stat-divider" aria-hidden="true" />
              <div className="dashboard__stat">
                <span className="dashboard__stat-label">Reste disponible</span>
                <AmountText
                  amount={summary.remaining}
                  size="row"
                  tone={summary.remaining < 0 ? 'negative' : 'positive'}
                />
              </div>
            </div>

            <Button variant="soft" icon={<Icon name="wallet" size={17} />} onClick={() => setBudgetSheetOpen(true)}>
              {summary.salary > 0 ? 'Modifier salaire et objectif' : 'Renseigner mon salaire'}
            </Button>
          </div>
        </Card>

        {/* Indicateurs */}
        <div className="grid-2">
          <Card>
            <KpiTile
              icon="arrowDownRight"
              tone="negative"
              label="Total dépensé"
              value={<AmountText amount={summary.total} size="tile" tone="negative" />}
              hint={summary.salary > 0 ? `${ratio(summary.consumption)} du salaire` : undefined}
            />
          </Card>
          <Card>
            <KpiTile
              icon="wallet"
              tone="positive"
              label="Épargne réelle"
              value={<AmountText amount={summary.realSavings} size="tile" tone="positive" />}
              hint={
                summary.salary > 0
                  ? `${ratio(summary.realSavings / summary.salary)} du salaire`
                  : undefined
              }
            />
          </Card>
          <Card>
            <KpiTile
              icon="target"
              tone="accent"
              label="Objectif"
              value={<AmountText amount={summary.savingsGoal} size="tile" />}
              hint={summary.savingsGoal > 0 ? `${ratio(summary.savingsProgress)} atteint` : 'Non défini'}
              footer={
                summary.savingsGoal > 0 ? (
                  <ProgressBar
                    value={summary.savingsProgress}
                    tone={summary.savingsProgress >= 1 ? 'var(--positive)' : 'var(--accent)'}
                  />
                ) : undefined
              }
            />
          </Card>
          <Card>
            <KpiTile
              icon="list"
              tone={summary.unpaidCount > 0 ? 'warning' : 'positive'}
              label="Dépenses"
              value={<span className="dashboard__count tnum">{summary.count}</span>}
              hint={
                summary.unpaidCount > 0
                  ? `dont ${summary.unpaidCount} à payer`
                  : summary.count > 0
                    ? 'toutes réglées'
                    : 'aucune ce mois-ci'
              }
            />
          </Card>
        </div>

        {/* Rappel des récurrentes */}
        {pending.length > 0 ? (
          <RecurringReminder statuses={pending} onQuickAdd={onAddFromRecurring} />
        ) : null}

        {/* Conseil contextuel */}
        <Card>
          <div className={`advice advice--${advice.tone}`}>
            <span className="advice__icon">
              <Icon
                name={
                  advice.tone === 'critical'
                    ? 'alert'
                    : advice.tone === 'warning'
                      ? 'trendDown'
                      : advice.tone === 'positive'
                        ? 'shield'
                        : 'info'
                }
                size={20}
              />
            </span>
            <div>
              <div className="advice__title">{advice.title}</div>
              <p className="advice__message">
                {lock.locked ? 'Déverrouillez l’app pour voir le détail.' : advice.message}
              </p>
            </div>
          </div>
        </Card>

        {/* Top catégories */}
        {summary.count > 0 ? (
          <Card>
            <div className="stack">
              <SectionHeader title="Où part l’argent" subtitle="Top catégories du mois" />
              {summary.byCategory.slice(0, 5).map((item, index) => (
                <RankRow
                  key={item.id}
                  rank={index + 1}
                  name={item.name}
                  amount={item.amount}
                  share={item.share}
                  color={categoryColor(index)}
                  icon={
                    <Icon name={data.categoryById(item.id)?.icon ?? 'tag'} size={15} />
                  }
                />
              ))}
            </div>
          </Card>
        ) : null}

        {/* Prévisions */}
        {summary.count > 0 ? (
          <Card>
            <div className="stack">
              <SectionHeader
                title="Prévisions fin de mois"
                subtitle={
                  summary.expectedRemaining > 0
                    ? `${plural(pending.length, 'récurrente')} pas encore saisie${pending.length > 1 ? 's' : ''} incluse${pending.length > 1 ? 's' : ''}`
                    : 'Toutes les récurrentes sont saisies'
                }
              />
              <ForecastRow label="Déjà dépensé" amount={summary.total} />
              <ForecastRow
                label="Reste à venir (récurrentes)"
                amount={summary.expectedRemaining}
                tone="warning"
              />
              <div className="dashboard__rule" />
              <ForecastRow label="Total projeté" amount={summary.forecastTotal} strong />
              <ForecastRow
                label="Reste estimé"
                amount={summary.forecastRemaining}
                tone={summary.forecastRemaining < 0 ? 'negative' : 'positive'}
                strong
              />
            </div>
          </Card>
        ) : null}

        {summary.count === 0 ? (
          <Card>
            <EmptyState
              icon={<Icon name="wallet" size={26} />}
              title={`Aucune dépense en ${monthName(data.month).toLowerCase()}`}
              message="Ajoutez votre première dépense : les indicateurs et les graphiques se remplissent aussitôt."
              action={
                <Button icon={<Icon name="plus" size={17} />} onClick={onAddExpense}>
                  Ajouter une dépense
                </Button>
              }
            />
          </Card>
        ) : null}
      </div>

      <MonthBudgetSheet open={budgetSheetOpen} onClose={() => setBudgetSheetOpen(false)} />
    </div>
  )
}

function KpiTile({
  icon,
  tone,
  label,
  value,
  hint,
  footer,
}: {
  icon: string
  tone: 'accent' | 'positive' | 'warning' | 'negative'
  label: string
  value: React.ReactNode
  hint?: string
  footer?: React.ReactNode
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
      {footer}
      {hint ? <div className="kpi__hint">{hint}</div> : null}
    </div>
  )
}

function ForecastRow({
  label,
  amount,
  tone = 'default',
  strong = false,
}: {
  label: string
  amount: number
  tone?: 'default' | 'positive' | 'warning' | 'negative'
  strong?: boolean
}) {
  return (
    <div className={`forecast-row ${strong ? 'forecast-row--strong' : ''}`}>
      <span>{label}</span>
      <AmountText amount={amount} size="row" tone={tone} />
    </div>
  )
}
