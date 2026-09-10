import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AmountInput, DateField, Segmented, Switch, TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { Icon } from '@/design-system/Icon'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { expenseRepository } from '@/repositories'
import { plannedAmountFor } from '@/services/budgetEngine'
import { money } from '@/services/format'
import {
  EXPENSE_TYPES,
  PAYMENT_STATUSES,
  STATUS_LABELS,
  TYPE_LABELS,
  todayISO,
  type Expense,
  type ExpenseType,
  type PaymentStatus,
} from '@/models/types'
import { haptic } from '@/utils/haptics'
import './ExpenseEditor.css'

export type EditorMode =
  | { kind: 'create'; date?: string }
  | { kind: 'createFromRecurring'; recurringId: string }
  | { kind: 'edit'; expense: Expense }

interface ExpenseEditorProps {
  open: boolean
  mode: EditorMode
  onClose: () => void
}

/**
 * Saisie et modification d'une dépense.
 *
 * Le chemin rapide tient en trois gestes : le montant a déjà le focus à
 * l'ouverture, la catégorie se choisit d'un tap, « Ajouter » enregistre. Le
 * reste (enseigne, date, type, statut, budget, remarque) est disponible juste
 * en dessous sans être imposé.
 */
export function ExpenseEditor({ open, mode, onClose }: ExpenseEditorProps) {
  const data = useData()
  const { notify } = useToast()

  const [amount, setAmount] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayISO())
  const [type, setType] = useState<ExpenseType>('variable')
  const [status, setStatus] = useState<PaymentStatus>('paye')
  const [plannedAmount, setPlannedAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [confidential, setConfidential] = useState(false)
  const [recurringId, setRecurringId] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = mode.kind === 'edit'

  // Réinitialisation à chaque ouverture, selon le mode.
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)

    if (mode.kind === 'edit') {
      const e = mode.expense
      setAmount(e.amount)
      setCategoryId(e.categoryId)
      setMerchantId(e.merchantId)
      setDescription(e.description)
      setDate(e.date)
      setType(e.type)
      setStatus(e.status)
      setPlannedAmount(e.plannedAmount)
      setNote(e.note)
      setConfidential(e.confidential)
      setRecurringId(e.recurringId)
      setShowDetails(e.plannedAmount !== null || e.note !== '' || e.confidential)
      return
    }

    if (mode.kind === 'createFromRecurring') {
      const item = data.recurring.find((row) => row.id === mode.recurringId)
      if (item) {
        const day = String(Math.min(item.dayOfMonth, 28)).padStart(2, '0')
        setAmount(item.plannedAmount)
        setCategoryId(item.categoryId)
        setMerchantId(item.merchantId)
        setDescription(item.description)
        setDate(`${data.year}-${String(data.month).padStart(2, '0')}-${day}`)
        setType(item.type)
        setStatus('paye')
        setPlannedAmount(item.plannedAmount)
        setNote(item.note)
        setConfidential(item.confidential)
        setRecurringId(item.id)
        setShowDetails(false)
      }
      return
    }

    // Création simple : tout à zéro, date du jour (ou 1er du mois affiché).
    const today = new Date()
    const isCurrentMonth =
      today.getFullYear() === data.year && today.getMonth() + 1 === data.month
    setAmount(0)
    setCategoryId('')
    setMerchantId('')
    setDescription('')
    setDate(
      mode.date ??
        (isCurrentMonth
          ? todayISO()
          : `${data.year}-${String(data.month).padStart(2, '0')}-01`),
    )
    setType('variable')
    setStatus('paye')
    setPlannedAmount(null)
    setNote('')
    setConfidential(false)
    setRecurringId(null)
    setShowDetails(false)
  }, [open, mode, data.recurring, data.year, data.month])

  /**
   * Reprend le montant prévu d'une récurrente dès que la description
   * correspond — l'équivalent direct du RECHERCHEV du classeur.
   */
  useEffect(() => {
    if (!open || isEditing) return
    if (plannedAmount !== null) return
    const planned = plannedAmountFor(description, data.recurring)
    if (planned !== null) setPlannedAmount(planned)
  }, [description, data.recurring, open, isEditing, plannedAmount])

  const variance = useMemo(() => {
    if (plannedAmount === null || plannedAmount === 0 || amount === 0) return null
    return amount - plannedAmount
  }, [amount, plannedAmount])

  const canSave = amount > 0 && categoryId !== ''

  const save = async () => {
    if (!canSave) return
    const payload = {
      date,
      categoryId,
      merchantId,
      description: description.trim(),
      amount,
      type,
      plannedAmount: plannedAmount !== null && plannedAmount > 0 ? plannedAmount : null,
      status,
      note: note.trim(),
      confidential,
      recurringId,
    }

    if (mode.kind === 'edit') {
      await expenseRepository.update(mode.expense.id, payload)
    } else {
      await expenseRepository.create(payload)
    }

    haptic('success')
    await data.refresh()
    notify(isEditing ? 'Dépense modifiée' : 'Dépense ajoutée', 'success')
    onClose()
  }

  const remove = async () => {
    if (mode.kind !== 'edit') return
    setConfirmDelete(false)
    await expenseRepository.remove(mode.expense.id)
    haptic('warning')
    await data.refresh()
    notify('Dépense supprimée')
    onClose()
  }

  return (
    <Sheet
      open={open}
      tall
      title={isEditing ? 'Modifier la dépense' : 'Nouvelle dépense'}
      onClose={onClose}
      action={{
        label: isEditing ? 'Enregistrer' : 'Ajouter',
        onClick: () => void save(),
        disabled: !canSave,
      }}
    >
      <div className="editor">
        <AmountInput
          label="Montant"
          value={amount}
          onChange={setAmount}
          autoFocus={!isEditing}
          hero
          hint={
            variance !== null ? (
              <span style={{ color: variance > 0 ? 'var(--negative)' : 'var(--positive)' }}>
                {variance > 0
                  ? `${money(variance)} au-dessus du budget`
                  : `${money(-variance)} sous le budget`}
              </span>
            ) : null
          }
        />

        <div className="field">
          <span className="field__label">Catégorie</span>
          <div className="chip-grid">
            {data.categories.map((category) => {
              const selected = categoryId === category.id
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`chip ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => {
                    haptic('light')
                    setCategoryId(category.id)
                  }}
                >
                  <Icon name={category.icon} size={15} />
                  <span>{category.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="expense-description">
            Description
          </label>
          <input
            id="expense-description"
            className="field__input"
            type="text"
            list="recurring-suggestions"
            placeholder="Ex. Courses de la semaine"
            value={description}
            enterKeyHint="done"
            onChange={(event) => setDescription(event.target.value)}
          />
          {/* Les récurrentes servent de suggestions : saisir « Loyer » remplit
              aussitôt le montant prévu. */}
          <datalist id="recurring-suggestions">
            {data.recurring.map((item) => (
              <option key={item.id} value={item.description} />
            ))}
          </datalist>
        </div>

        <button
          type="button"
          className="editor__disclosure"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((value) => !value)}
        >
          <Icon name={showDetails ? 'chevronUp' : 'chevronDown'} size={17} />
          <span>Enseigne, date, type, budget prévu…</span>
        </button>

        {showDetails ? (
          <div className="stack editor__details">
            <div className="field">
              <label className="field__label" htmlFor="expense-merchant">
                Enseigne
              </label>
              <select
                id="expense-merchant"
                className="field__input"
                value={merchantId}
                onChange={(event) => setMerchantId(event.target.value)}
              >
                <option value="">Aucune</option>
                {data.merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name}
                  </option>
                ))}
              </select>
            </div>

            <DateField label="Date" value={date} onChange={setDate} />

            <Segmented
              label="Type"
              value={type}
              onChange={setType}
              options={EXPENSE_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))}
            />

            <Segmented
              label="Statut"
              value={status}
              onChange={setStatus}
              options={PAYMENT_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
            />

            <Switch
              label="Montant prévu"
              description="Permet de calculer l’écart avec le budget."
              checked={plannedAmount !== null}
              onChange={(checked) => setPlannedAmount(checked ? (plannedAmount ?? amount) : null)}
            />
            {plannedAmount !== null ? (
              <AmountInput label="Budget" value={plannedAmount} onChange={setPlannedAmount} />
            ) : null}

            <TextField
              label="Remarque"
              value={note}
              onChange={setNote}
              placeholder="Optionnel"
              multiline
            />

            <Switch
              label="Confidentiel"
              description="Le montant reste masqué même une fois l’app déverrouillée."
              checked={confidential}
              onChange={setConfidential}
            />
          </div>
        ) : null}

        {isEditing ? (
          <Button
            variant="danger"
            block
            icon={<Icon name="trash" size={17} />}
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer cette dépense
          </Button>
        ) : null}

        <ConfirmDialog
          open={confirmDelete}
          title="Supprimer cette dépense ?"
          warning="Cette action est irréversible."
          confirmLabel="Supprimer"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </Sheet>
  )
}
