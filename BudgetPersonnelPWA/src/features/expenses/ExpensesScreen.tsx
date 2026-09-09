import { useMemo, useState } from 'react'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { Card, EmptyState, SectionHeader, TagChip } from '@/components/Card'
import { AmountText } from '@/components/AmountText'
import { Button, IconButton } from '@/components/Button'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { Icon } from '@/design-system/Icon'
import { categoryColor } from '@/design-system/colors'
import { useSwipe } from '@/hooks/useSwipe'
import { expenseRepository } from '@/repositories'
import { varianceOf } from '@/services/budgetEngine'
import { formatWeekday, monthName, plural, signedMoney } from '@/services/format'
import {
  EXPENSE_TYPES,
  PAYMENT_STATUSES,
  STATUS_LABELS,
  TYPE_LABELS,
  type Expense,
  type ExpenseType,
  type PaymentStatus,
} from '@/models/types'
import { haptic } from '@/utils/haptics'
import './Expenses.css'

interface ExpensesScreenProps {
  onAdd: () => void
  onEdit: (expense: Expense) => void
}

/** Liste des dépenses du mois : recherche, filtres, actions rapides. */
export function ExpensesScreen({ onAdd, onEdit }: ExpensesScreenProps) {
  const data = useData()
  const { notify } = useToast()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ExpenseType | null>(null)
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | null>(null)

  const swipe = useSwipe((direction) => data.shiftPeriod(direction))

  const monthKey = `${data.year}-${String(data.month).padStart(2, '0')}`

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr')
    return data.expenses.filter((expense) => {
      if (expense.monthKey !== monthKey) return false
      if (typeFilter && expense.type !== typeFilter) return false
      if (statusFilter && expense.status !== statusFilter) return false
      if (!needle) return true
      const haystack = [
        expense.description,
        data.categoryName(expense.categoryId) ?? '',
        data.merchantName(expense.merchantId) ?? '',
        expense.note,
      ]
        .join(' ')
        .toLocaleLowerCase('fr')
      return haystack.includes(needle)
    })
  }, [data, monthKey, search, typeFilter, statusFilter])

  /** Regroupement par jour, du plus récent au plus ancien. */
  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const expense of filtered) {
      const bucket = map.get(expense.date)
      if (bucket) bucket.push(expense)
      else map.set(expense.date, [expense])
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const total = filtered.reduce((sum, expense) => sum + expense.amount, 0)
  const isFiltering = search.trim() !== '' || typeFilter !== null || statusFilter !== null

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === data.year && today.getMonth() + 1 === data.month

  const toggleStatus = async (expense: Expense) => {
    haptic('success')
    await expenseRepository.update(expense.id, {
      status: expense.status === 'paye' ? 'aPayer' : 'paye',
    })
    await data.refresh()
  }

  const remove = async (expense: Expense) => {
    haptic('warning')
    await expenseRepository.remove(expense.id)
    await data.refresh()
    notify('Dépense supprimée')
  }

  return (
    <div className="screen" {...swipe}>
      <header className="screen__header">
        <h1 className="screen__title">Dépenses</h1>
        <MonthSwitcher
          year={data.year}
          month={data.month}
          onShift={data.shiftPeriod}
          onToday={data.goToToday}
          isCurrent={isCurrentMonth}
        />

        <div className="search">
          <Icon name="search" size={17} />
          <input
            type="search"
            className="search__input"
            placeholder="Rechercher une dépense, une enseigne…"
            value={search}
            aria-label="Rechercher une dépense"
            onChange={(event) => setSearch(event.target.value)}
          />
          {search ? (
            <button type="button" className="search__clear" aria-label="Effacer la recherche" onClick={() => setSearch('')}>
              <Icon name="x" size={15} />
            </button>
          ) : null}
        </div>

        <div className="filters" role="group" aria-label="Filtres">
          <FilterChip
            label="Tout"
            active={!isFiltering}
            onClick={() => {
              setTypeFilter(null)
              setStatusFilter(null)
              setSearch('')
            }}
          />
          {PAYMENT_STATUSES.map((value) => (
            <FilterChip
              key={value}
              label={STATUS_LABELS[value]}
              active={statusFilter === value}
              onClick={() => setStatusFilter(statusFilter === value ? null : value)}
            />
          ))}
          {EXPENSE_TYPES.map((value) => (
            <FilterChip
              key={value}
              label={TYPE_LABELS[value]}
              active={typeFilter === value}
              onClick={() => setTypeFilter(typeFilter === value ? null : value)}
            />
          ))}
        </div>
      </header>

      <div className="stack">
        {filtered.length > 0 ? (
          <>
            <Card>
              <SectionHeader
                title={`${filtered.length} ${plural(filtered.length, 'dépense')}`}
                subtitle={isFiltering ? 'Total filtré' : 'Total du mois'}
                trailing={<AmountText amount={total} privacyKey="totalSpent" size="tile" />}
              />
            </Card>

            {groups.map(([date, items]) => (
              <Card key={date} flush>
                <div className="day-group__header">
                  <span className="day-group__date">{formatWeekday(date)}</span>
                  <AmountText
                    amount={items.reduce((sum, item) => sum + item.amount, 0)}
                    privacyKey="expenseAmounts"
                    size="caption"
                    tone="muted"
                  />
                </div>
                <ul className="list-rows">
                  {items.map((expense) => (
                    <ExpenseRow
                      key={expense.id}
                      expense={expense}
                      categoryName={data.categoryName(expense.categoryId) ?? 'Sans catégorie'}
                      merchantName={data.merchantName(expense.merchantId)}
                      icon={data.categoryById(expense.categoryId)?.icon ?? 'tag'}
                      color={categoryColor(
                        data.categories.findIndex((c) => c.id === expense.categoryId) % 6,
                      )}
                      onEdit={() => onEdit(expense)}
                      onToggleStatus={() => void toggleStatus(expense)}
                      onDelete={() => void remove(expense)}
                    />
                  ))}
                </ul>
              </Card>
            ))}
          </>
        ) : (
          <Card>
            <EmptyState
              icon={<Icon name={isFiltering ? 'filter' : 'wallet'} size={26} />}
              title={isFiltering ? 'Aucun résultat' : `Aucune dépense en ${monthName(data.month).toLowerCase()}`}
              message={
                isFiltering
                  ? 'Aucune dépense de ce mois ne correspond à votre recherche ou à vos filtres.'
                  : 'Ajoutez votre première dépense : les indicateurs et les graphiques se remplissent aussitôt.'
              }
              action={
                isFiltering ? (
                  <Button
                    variant="soft"
                    onClick={() => {
                      setSearch('')
                      setTypeFilter(null)
                      setStatusFilter(null)
                    }}
                  >
                    Effacer les filtres
                  </Button>
                ) : (
                  <Button icon={<Icon name="plus" size={17} />} onClick={onAdd}>
                    Ajouter une dépense
                  </Button>
                )
              }
            />
          </Card>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`filter-chip ${active ? 'is-active' : ''}`}
      aria-pressed={active}
      onClick={() => {
        haptic('light')
        onClick()
      }}
    >
      {label}
    </button>
  )
}

interface ExpenseRowProps {
  expense: Expense
  categoryName: string
  merchantName?: string
  icon: string
  color: string
  onEdit: () => void
  onToggleStatus: () => void
  onDelete: () => void
}

/**
 * Une ligne de dépense.
 *
 * Le libellé domine, la catégorie et l'enseigne le contextualisent, le montant
 * ferme la ligne. Les actions rapides sont des boutons visibles plutôt qu'un
 * balayage caché : sur le Web le geste de balayage entre en conflit avec le
 * défilement et la navigation arrière de Safari, et il resterait invisible au
 * clavier comme aux lecteurs d'écran.
 */
function ExpenseRow({
  expense,
  categoryName,
  merchantName,
  icon,
  color,
  onEdit,
  onToggleStatus,
  onDelete,
}: ExpenseRowProps) {
  const variance = varianceOf(expense)
  const subtitle = [categoryName, merchantName].filter(Boolean).join(' · ')

  return (
    <li className="expense-row">
      <button type="button" className="expense-row__main" onClick={onEdit}>
        <span
          className="expense-row__icon"
          style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
          aria-hidden="true"
        >
          <Icon name={icon} size={17} />
        </span>

        <span className="expense-row__text">
          <span className="expense-row__title">
            {expense.description || categoryName}
            {expense.confidential ? (
              <Icon name="eyeOff" size={13} className="expense-row__private" />
            ) : null}
          </span>
          <span className="expense-row__subtitle">{subtitle}</span>
          <span className="expense-row__tags">
            {expense.status === 'aPayer' ? (
              <TagChip label={STATUS_LABELS.aPayer} tone="warning" />
            ) : null}
            {expense.type !== 'variable' ? (
              <TagChip label={TYPE_LABELS[expense.type]} tone="neutral" />
            ) : null}
          </span>
        </span>

        <span className="expense-row__amounts">
          <AmountText
            amount={expense.amount}
            privacyKey={expense.confidential ? 'confidentialExpenses' : 'expenseAmounts'}
            size="row"
          />
          {variance !== null ? (
            <span
              className="expense-row__variance tnum"
              style={{ color: variance > 0 ? 'var(--negative)' : 'var(--positive)' }}
            >
              {signedMoney(variance)}
            </span>
          ) : null}
        </span>
      </button>

      <span className="expense-row__actions">
        <IconButton
          label={
            expense.status === 'paye'
              ? `Marquer ${expense.description || categoryName} à payer`
              : `Marquer ${expense.description || categoryName} payée`
          }
          tone="neutral"
          onClick={onToggleStatus}
        >
          <Icon name={expense.status === 'paye' ? 'clock' : 'check'} size={16} />
        </IconButton>
        <IconButton
          label={`Supprimer ${expense.description || categoryName}`}
          tone="neutral"
          onClick={onDelete}
        >
          <Icon name="trash" size={16} />
        </IconButton>
      </span>
    </li>
  )
}
