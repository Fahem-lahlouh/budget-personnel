import { useEffect, useState } from 'react'
import { useData } from '@/app/DataContext'
import { useUnlockSession } from '@/app/UnlockSession'
import { useToast } from '@/app/ToastContext'
import { Sheet } from '@/components/Sheet'
import { Card, SectionHeader, TagChip } from '@/components/Card'
import { Button } from '@/components/Button'
import { AmountText, useIsAmountMasked } from '@/components/AmountText'
import { Icon } from '@/design-system/Icon'
import { receiptRepository, receiptImageRepository } from '@/repositories'
import { itemsTotal, type Receipt } from '@/models/receipt'
import { money } from '@/services/format'
import { STATUS_LABELS, TYPE_LABELS, type Expense } from '@/models/types'
import '@/features/imports/ImportFlow.css'
import './ExpenseDetail.css'

interface ExpenseDetailSheetProps {
  open: boolean
  expense: Expense | null
  onClose: () => void
  onEdit: (expense: Expense) => void
}

/**
 * Détail d'une dépense, ticket de caisse compris.
 *
 * La confidentialité s'applique au ticket entier, pas seulement aux montants :
 * une dépense marquée confidentielle cache aussi ce qui a été acheté et la
 * photo du ticket. Le nom des articles est au moins aussi parlant que la somme
 * — masquer l'un en laissant l'autre ne protégerait rien.
 */
export function ExpenseDetailSheet({ open, expense, onClose, onEdit }: ExpenseDetailSheetProps) {
  const data = useData()
  const session = useUnlockSession()
  const { notify } = useToast()

  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const hidden = useIsAmountMasked(undefined, expense?.confidential ?? false)

  useEffect(() => {
    if (!open || !expense) {
      setReceipt(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void receiptRepository.forExpense(expense.id).then((found) => {
      if (!cancelled) {
        setReceipt(found ?? null)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, expense])

  // La photo n'est lue qu'une fois le ticket visible : inutile de sortir des
  // mégaoctets d'IndexedDB pour une dépense dont le détail reste masqué.
  useEffect(() => {
    if (!receipt?.hasImage || hidden) {
      setPhotoUrl(null)
      return
    }
    let url: string | null = null
    let cancelled = false
    void receiptImageRepository.get(receipt.id).then((image) => {
      if (cancelled || !image) return
      url = URL.createObjectURL(image.blob)
      setPhotoUrl(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [receipt, hidden])

  if (!expense) return null

  const categoryName = data.categoryName(expense.categoryId) ?? 'Sans catégorie'
  const merchantName = data.merchantName(expense.merchantId)
  const linesTotal = receipt ? itemsTotal(receipt.items) : 0
  const mismatch = receipt !== null && receipt.items.length > 0 && Math.abs(linesTotal - receipt.total) >= 0.01

  const revealReceipt = () => {
    void (async () => {
      if (!(await session.isPinConfigured())) {
        notify('Configurez un code dans Réglages → Sécurité pour révéler ce ticket', 'error')
        return
      }
      if (data.settings) void session.reveal(['confidentialExpenses'], data.settings)
    })()
  }

  return (
    <Sheet
      open={open}
      tall
      title="Détail de la dépense"
      onClose={onClose}
      action={{ label: 'Modifier', onClick: () => onEdit(expense) }}
    >
      <div className="stack">
        <Card>
          <div className="expense-detail__head">
            <div>
              <div className="expense-detail__title">
                {expense.description || merchantName || categoryName}
              </div>
              <div className="expense-detail__meta">
                {new Date(`${expense.date}T00:00:00`).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
            <AmountText
              amount={expense.amount}
              size="tile"
              privacyKey={expense.confidential ? 'confidentialExpenses' : 'expenseAmounts'}
            />
          </div>

          <div className="review-row__badges">
            <TagChip label={categoryName} tone="accent" />
            {merchantName ? <TagChip label={merchantName} tone="neutral" /> : null}
            <TagChip label={TYPE_LABELS[expense.type]} tone="neutral" />
            <TagChip
              label={STATUS_LABELS[expense.status]}
              tone={expense.status === 'paye' ? 'positive' : 'warning'}
            />
            {expense.confidential ? <TagChip label="Confidentielle" tone="warning" /> : null}
          </div>

          {expense.plannedAmount !== null ? (
            <div className="expense-detail__line">
              <span>Prévu</span>
              <AmountText amount={expense.plannedAmount} privacyKey="budgetGoal" />
            </div>
          ) : null}

          {expense.note ? <p className="expense-detail__note">{expense.note}</p> : null}
        </Card>

        {loading ? null : receipt === null ? (
          <Card>
            <SectionHeader
              title="Aucun ticket"
              subtitle="Photographiez un ticket depuis le bouton « + » pour garder le détail de vos achats"
            />
          </Card>
        ) : hidden ? (
          <Card>
            <SectionHeader
              title="Ticket masqué"
              subtitle="Cette dépense est confidentielle : ses articles et sa photo le sont aussi"
            />
            <Button icon={<Icon name="eye" size={17} />} onClick={revealReceipt}>
              Révéler le ticket
            </Button>
          </Card>
        ) : (
          <>
            <Card>
              <SectionHeader
                title={`${receipt.items.length} article${receipt.items.length > 1 ? 's' : ''}`}
                subtitle={
                  mismatch
                    ? `Somme des lignes ${money(linesTotal)} — total du ticket ${money(receipt.total)}`
                    : receipt.merchantName || undefined
                }
              />
              {receipt.items.length === 0 ? (
                <p className="import-flow__hint">
                  Aucun article n’avait été reconnu sur ce ticket.
                </p>
              ) : (
                <ul className="receipt-items">
                  {receipt.items.map((item) => (
                    <li key={item.id} className="receipt-items__row">
                      <span className="receipt-items__label">
                        {item.label}
                        {item.quantity !== null ? (
                          <span className="receipt-items__qty">
                            {item.quantity} ×{' '}
                            {item.unitPrice !== null ? money(item.unitPrice) : '—'}
                          </span>
                        ) : null}
                      </span>
                      <AmountText
                        amount={item.totalPrice}
                        privacyKey={expense.confidential ? 'confidentialExpenses' : 'expenseAmounts'}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {photoUrl ? (
              <Card>
                <SectionHeader title="Photo du ticket" />
                <img className="expense-detail__photo" src={photoUrl} alt="Ticket de caisse" />
              </Card>
            ) : receipt.hasImage ? null : (
              <Card>
                <SectionHeader
                  title="Pas de photo"
                  subtitle="La conservation des photos était désactivée lors de ce scan"
                />
              </Card>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
