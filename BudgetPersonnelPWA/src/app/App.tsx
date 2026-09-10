import { useEffect, useState } from 'react'
import { DataProvider, useData } from './DataContext'
import { LockProvider, useLock } from './LockContext'
import { UnlockSessionProvider } from './UnlockSession'
import { ToastProvider } from './ToastContext'
import { TabBar, type TabId } from './TabBar'
import { UpdatePrompt } from './UpdatePrompt'
import { DashboardScreen } from '@/features/dashboard/DashboardScreen'
import { ExpensesScreen } from '@/features/expenses/ExpensesScreen'
import { ExpenseEditor, type EditorMode } from '@/features/expenses/ExpenseEditor'
import { AnalyticsScreen } from '@/features/analytics/AnalyticsScreen'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { LockScreen } from '@/features/security/LockScreen'
import { AddOptionsSheet } from '@/features/imports/AddOptionsSheet'
import { ImportFlow } from '@/features/imports/ImportFlow'
import { ReceiptFlow } from '@/features/imports/ReceiptFlow'
import { ExpenseDetailSheet } from '@/features/expenses/ExpenseDetailSheet'
import { Sheet } from '@/components/Sheet'
import { YearOverview } from '@/features/year/YearOverview'
import { summarizeYear } from '@/services/budgetEngine'
import type { Expense } from '@/models/types'

export function App() {
  return (
    <DataProvider>
      <ToastProvider>
        <AppWithLock />
      </ToastProvider>
    </DataProvider>
  )
}

/** Le verrouillage a besoin des réglages : il est monté sous `DataProvider`. */
function AppWithLock() {
  const data = useData()
  return (
    <LockProvider settings={data.settings}>
      <UnlockSessionProvider settings={data.settings}>
        <Shell />
      </UnlockSessionProvider>
    </LockProvider>
  )
}

function Shell() {
  const data = useData()
  const lock = useLock()

  const [tab, setTab] = useState<TabId>('dashboard')
  const [editor, setEditor] = useState<EditorMode | null>(null)
  const [yearOpen, setYearOpen] = useState(false)
  const [addOptionsOpen, setAddOptionsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [detail, setDetail] = useState<Expense | null>(null)

  // Applique le thème choisi à la racine du document.
  useEffect(() => {
    const theme = data.settings?.theme ?? 'system'
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [data.settings?.theme])

  const yearSummary = summarizeYear({
    expenses: data.expenses,
    recurring: data.recurring,
    budgets: data.budgets,
    year: data.year,
    categoryName: data.categoryName,
    merchantName: data.merchantName,
  })

  if (!data.ready) {
    return (
      <div className="boot" role="status" aria-live="polite">
        <span className="boot__spinner" aria-hidden="true" />
        <span className="sr-only">Chargement de vos données…</span>
      </div>
    )
  }

  // Ouvrir une dépense montre son détail (et son ticket) ; la modification
  // reste accessible depuis là, d'un bouton.
  const openDetailForExpense = (expense: Expense) => setDetail(expense)

  return (
    <div className="app-shell">
      {tab === 'dashboard' ? (
        <DashboardScreen
          onAddExpense={() => setEditor({ kind: 'create' })}
          onAddFromRecurring={(recurringId) => setEditor({ kind: 'createFromRecurring', recurringId })}
          onOpenYear={() => setYearOpen(true)}
        />
      ) : null}

      {tab === 'expenses' ? (
        <ExpensesScreen onAdd={() => setEditor({ kind: 'create' })} onEdit={openDetailForExpense} />
      ) : null}

      {tab === 'analytics' ? <AnalyticsScreen /> : null}
      {tab === 'settings' ? <SettingsScreen /> : null}

      <TabBar active={tab} onSelect={setTab} onAdd={() => setAddOptionsOpen(true)} />

      <ExpenseEditor
        open={editor !== null}
        mode={editor ?? { kind: 'create' }}
        onClose={() => setEditor(null)}
      />

      <AddOptionsSheet
        open={addOptionsOpen}
        onClose={() => setAddOptionsOpen(false)}
        onManual={() => {
          setAddOptionsOpen(false)
          setEditor({ kind: 'create' })
        }}
        onImport={() => {
          setAddOptionsOpen(false)
          setImportOpen(true)
        }}
        onReceipt={() => {
          setAddOptionsOpen(false)
          setReceiptOpen(true)
        }}
      />

      <ImportFlow open={importOpen} onClose={() => setImportOpen(false)} />
      <ReceiptFlow open={receiptOpen} onClose={() => setReceiptOpen(false)} />

      <ExpenseDetailSheet
        open={detail !== null}
        expense={detail}
        onClose={() => setDetail(null)}
        onEdit={(expense) => {
          setDetail(null)
          setEditor({ kind: 'edit', expense })
        }}
      />

      <Sheet open={yearOpen} tall title={`Année ${data.year}`} onClose={() => setYearOpen(false)}>
        <div style={{ paddingTop: 12 }}>
          <YearOverview
            summary={yearSummary}
            points={yearSummary.months.map((month) => ({
              month: month.month,
              salary: month.salary,
              spent: month.total,
            }))}
          />
        </div>
      </Sheet>

      <UpdatePrompt />

      {lock.locked ? <LockScreen /> : null}
    </div>
  )
}
