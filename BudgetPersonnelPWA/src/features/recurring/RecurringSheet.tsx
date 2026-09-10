import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AmountInput, Segmented, Switch, TextField } from '@/components/Field'
import { Button } from '@/components/Button'
import { AmountText } from '@/components/AmountText'
import { SectionHeader } from '@/components/Card'
import { Icon } from '@/design-system/Icon'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { recurringRepository } from '@/repositories'
import { EXPENSE_TYPES, TYPE_LABELS, type ExpenseType, type RecurringExpense } from '@/models/types'
import '@/features/settings/Settings.css'

/** Gestion des dépenses récurrentes : liste, création, édition. */
export function RecurringSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData()
  const [editing, setEditing] = useState<RecurringExpense | 'new' | null>(null)

  const active = data.recurring.filter((item) => item.active)
  const inactive = data.recurring.filter((item) => !item.active)
  const total = active.reduce((sum, item) => sum + item.plannedAmount, 0)

  return (
    <>
      <Sheet
        open={open && editing === null}
        tall
        title="Dépenses récurrentes"
        onClose={onClose}
        action={{ label: 'Ajouter', onClick: () => setEditing('new') }}
      >
        <div className="stack" style={{ paddingTop: 10 }}>
          <div className="settings__summary">
            <SectionHeader
              title="Total mensuel prévu"
              subtitle={`${active.length} active${active.length > 1 ? 's' : ''}`}
              trailing={<AmountText amount={total} privacyKey="budgetGoal" size="tile" />}
            />
          </div>

          <p className="settings__note">
            Les récurrentes fournissent le montant prévu, alimentent « À payer ce mois-ci » et
            pré-remplissent la saisie.
          </p>

          {data.recurring.length === 0 ? (
            <p className="chart-empty">
              Aucune récurrente. Ajoutez vos dépenses qui reviennent chaque mois : loyer, crédit,
              abonnements, assurances…
            </p>
          ) : (
            <ul className="list-rows">
              {[...active, ...inactive].map((item) => (
                <li key={item.id} className="recurring-row">
                  <span className="recurring-row__day" aria-hidden="true">
                    {item.dayOfMonth}
                  </span>
                  <button
                    type="button"
                    className="recurring-row__main"
                    onClick={() => setEditing(item)}
                  >
                    <span className={`recurring-row__name ${item.active ? '' : 'is-inactive'}`}>
                      {item.description}
                    </span>
                    <span className="recurring-row__meta">
                      {data.categoryName(item.categoryId) ?? '—'}
                      {item.active ? '' : ' · désactivée'}
                    </span>
                  </button>
                  <AmountText
                    amount={item.plannedAmount}
                    privacyKey={item.confidential ? 'confidentialExpenses' : 'expenseAmounts'}
                    size="row"
                    tone={item.active ? 'default' : 'muted'}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      <RecurringEditor
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function RecurringEditor({
  open,
  item,
  onClose,
}: {
  open: boolean
  item: RecurringExpense | null
  onClose: () => void
}) {
  const data = useData()
  const { notify } = useToast()

  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [amount, setAmount] = useState(0)
  const [day, setDay] = useState(1)
  const [type, setType] = useState<ExpenseType>('fixe')
  const [note, setNote] = useState('')
  const [confidential, setConfidential] = useState(false)
  const [active, setActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    if (item) {
      setDescription(item.description)
      setCategoryId(item.categoryId)
      setMerchantId(item.merchantId)
      setAmount(item.plannedAmount)
      setDay(item.dayOfMonth)
      setType(item.type)
      setNote(item.note)
      setConfidential(item.confidential)
      setActive(item.active)
    } else {
      setDescription('')
      setCategoryId(data.categories[0]?.id ?? '')
      setMerchantId('')
      setAmount(0)
      setDay(1)
      setType('fixe')
      setNote('')
      setConfidential(false)
      setActive(true)
    }
  }, [open, item, data.categories])

  const canSave = amount > 0 && categoryId !== '' && description.trim() !== ''

  const save = async () => {
    if (!canSave) return
    const payload = {
      categoryId,
      merchantId,
      description: description.trim(),
      plannedAmount: amount,
      dayOfMonth: day,
      type,
      note: note.trim(),
      confidential,
      active,
    }
    if (item) await recurringRepository.update(item.id, payload)
    else await recurringRepository.create(payload)
    await data.refresh()
    notify(item ? 'Récurrente modifiée' : 'Récurrente ajoutée', 'success')
    onClose()
  }

  const remove = async () => {
    if (!item) return
    setConfirmDelete(false)
    await recurringRepository.remove(item.id)
    await data.refresh()
    notify('Récurrente supprimée')
    onClose()
  }

  return (
    <Sheet
      open={open}
      tall
      title={item ? 'Modifier la récurrente' : 'Nouvelle récurrente'}
      onClose={onClose}
      action={{ label: 'Enregistrer', onClick: () => void save(), disabled: !canSave }}
    >
      <div className="stack" style={{ paddingTop: 12 }}>
        <TextField
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="Ex. Loyer"
        />

        <div className="field">
          <label className="field__label" htmlFor="recurring-category">
            Catégorie
          </label>
          <select
            id="recurring-category"
            className="field__input"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {data.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="recurring-merchant">
            Enseigne
          </label>
          <select
            id="recurring-merchant"
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

        <AmountInput label="Montant prévu" value={amount} onChange={setAmount} />

        <div className="field">
          <label className="field__label" htmlFor="recurring-day">
            Jour du mois
          </label>
          <select
            id="recurring-day"
            className="field__input"
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
          >
            {Array.from({ length: 31 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <p className="settings__note">
            Si le jour n’existe pas dans un mois (le 31 en février), l’échéance est ramenée au
            dernier jour du mois.
          </p>
        </div>

        <Segmented
          label="Type"
          value={type}
          onChange={setType}
          options={EXPENSE_TYPES.map((value) => ({ value, label: TYPE_LABELS[value] }))}
        />

        <TextField label="Remarque" value={note} onChange={setNote} placeholder="Optionnel" multiline />

        <Switch label="Confidentiel" checked={confidential} onChange={setConfidential} />
        <Switch
          label="Active"
          description="Une récurrente désactivée ne génère plus de rappel ni de montant prévu."
          checked={active}
          onChange={setActive}
        />

        {item ? (
          <Button
            variant="danger"
            block
            icon={<Icon name="trash" size={17} />}
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer
          </Button>
        ) : null}

        <ConfirmDialog
          open={confirmDelete}
          title="Supprimer cette récurrente ?"
          message="Les dépenses déjà saisies depuis ce modèle sont conservées."
          warning="Cette action est irréversible."
          confirmLabel="Supprimer"
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </Sheet>
  )
}
