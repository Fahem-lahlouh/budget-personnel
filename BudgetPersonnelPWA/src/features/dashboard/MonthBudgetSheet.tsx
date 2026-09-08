import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { AmountInput, Switch } from '@/components/Field'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { monthBudgetRepository } from '@/repositories'
import { monthLabel } from '@/services/format'

/** Saisie du salaire et de l'objectif d'épargne du mois affiché. */
export function MonthBudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData()
  const { notify } = useToast()

  const [salary, setSalary] = useState(0)
  const [goal, setGoal] = useState(0)
  const [applyForward, setApplyForward] = useState(false)

  useEffect(() => {
    if (!open) return
    void (async () => {
      const existing = data.budgetFor(data.year, data.month)
      if (existing) {
        setSalary(existing.salary)
        setGoal(existing.savingsGoal)
        return
      }
      // Premier passage sur ce mois : proposer les valeurs du dernier mois
      // renseigné plutôt qu'un formulaire vide.
      const previous = await monthBudgetRepository.latestBefore(data.year, data.month)
      setSalary(previous?.salary ?? 0)
      setGoal(previous?.savingsGoal ?? 0)
    })()
  }, [open, data])

  const save = async () => {
    await monthBudgetRepository.set(data.year, data.month, salary, goal)

    if (applyForward && data.month < 12) {
      const known = new Set(data.budgets.map((budget) => budget.id))
      for (let month = data.month + 1; month <= 12; month += 1) {
        const key = `${data.year}-${String(month).padStart(2, '0')}`
        // On ne réécrit jamais un mois déjà renseigné à la main.
        if (known.has(key)) continue
        await monthBudgetRepository.set(data.year, month, salary, goal)
      }
    }

    await data.refresh()
    notify('Salaire enregistré', 'success')
    onClose()
  }

  return (
    <Sheet
      open={open}
      title="Salaire & épargne"
      onClose={onClose}
      action={{ label: 'Enregistrer', onClick: () => void save() }}
    >
      <div className="stack" style={{ paddingTop: 8 }}>
        <p className="sheet-intro">
          Ces montants concernent <strong>{monthLabel(data.year, data.month)}</strong>. Le salaire
          sert de base à la jauge de consommation, au reste disponible et à l’épargne.
        </p>

        <AmountInput label="Salaire net du mois" value={salary} onChange={setSalary} autoFocus />
        <AmountInput label="Objectif d’épargne" value={goal} onChange={setGoal} />

        {data.month < 12 ? (
          <Switch
            label="Reporter sur les mois suivants"
            description={`Applique ces montants jusqu’à décembre ${data.year}, sans écraser les mois déjà renseignés.`}
            checked={applyForward}
            onChange={setApplyForward}
          />
        ) : null}
      </div>
    </Sheet>
  )
}
