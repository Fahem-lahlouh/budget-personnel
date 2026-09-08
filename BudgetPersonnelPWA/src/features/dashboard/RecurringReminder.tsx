import { Card, SectionHeader } from '@/components/Card'
import { AmountText } from '@/components/AmountText'
import { IconButton } from '@/components/Button'
import { Icon } from '@/design-system/Icon'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { expenseRepository } from '@/repositories'
import { formatDayMonth, plural } from '@/services/format'
import type { RecurringStatus } from '@/services/budgetEngine'
import { haptic } from '@/utils/haptics'
import './RecurringReminder.css'

interface RecurringReminderProps {
  statuses: RecurringStatus[]
  onQuickAdd: (recurringId: string) => void
}

/**
 * « À payer ce mois-ci ».
 *
 * Deux situations distinctes, signalées différemment : la récurrente n'a pas
 * encore été saisie du tout, ou elle l'a été mais reste marquée « à payer ».
 */
export function RecurringReminder({ statuses, onQuickAdd }: RecurringReminderProps) {
  const data = useData()
  const { notify } = useToast()

  const total = statuses.reduce(
    (sum, status) => sum + (status.matched?.amount ?? status.recurring.plannedAmount),
    0,
  )

  const markPaid = async (status: RecurringStatus) => {
    haptic('success')
    if (status.matched) {
      await expenseRepository.update(status.matched.id, { status: 'paye' })
    } else {
      const item = status.recurring
      await expenseRepository.create({
        date: status.dueDate,
        categoryId: item.categoryId,
        merchantId: item.merchantId,
        description: item.description,
        amount: item.plannedAmount,
        type: item.type,
        plannedAmount: item.plannedAmount,
        status: 'paye',
        note: item.note,
        confidential: item.confidential,
        recurringId: item.id,
      })
    }
    await data.refresh()
    notify(`${status.recurring.description} marquée payée`, 'success')
  }

  return (
    <Card>
      <div className="stack">
        <SectionHeader
          title="À payer ce mois-ci"
          subtitle={`${statuses.length} ${plural(statuses.length, 'récurrente')} en attente`}
          trailing={<AmountText amount={total} size="row" tone="warning" />}
        />

        <ul className="reminder__list">
          {statuses.map((status) => (
            <li key={status.recurring.id} className="reminder__item">
              <span
                className={`reminder__dot ${status.isMissing ? 'is-missing' : 'is-pending'}`}
                aria-hidden="true"
              >
                <Icon name={status.isMissing ? 'clock' : 'alert'} size={16} />
              </span>

              <span className="reminder__text">
                <span className="reminder__name">{status.recurring.description}</span>
                <span className="reminder__meta">
                  {status.isMissing
                    ? `Prévue le ${formatDayMonth(status.dueDate)} · non saisie`
                    : `Saisie le ${formatDayMonth(status.matched?.date ?? status.dueDate)} · à payer`}
                </span>
              </span>

              <AmountText
                amount={status.matched?.amount ?? status.recurring.plannedAmount}
                size="row"
                confidential={status.recurring.confidential}
                tone="muted"
              />

              <span className="reminder__buttons">
                {status.isMissing ? (
                  <IconButton
                    label={`Saisir ${status.recurring.description}`}
                    onClick={() => onQuickAdd(status.recurring.id)}
                  >
                    <Icon name="plus" size={17} />
                  </IconButton>
                ) : null}
                <IconButton
                  label={`Marquer ${status.recurring.description} comme payée`}
                  onClick={() => void markPaid(status)}
                >
                  <Icon name="check" size={17} />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
