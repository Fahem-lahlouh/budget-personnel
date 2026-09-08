import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppSettings,
  Category,
  Expense,
  Merchant,
  MonthBudget,
  RecurringExpense,
} from '@/models/types'
import {
  bootstrap,
  categoryRepository,
  expenseRepository,
  merchantRepository,
  monthBudgetRepository,
  recurringRepository,
  settingsRepository,
} from '@/repositories'
import { requestPersistentStorage } from '@/repositories/db'

/**
 * Source unique des données de l'application.
 *
 * Les listes de référence (catégories, enseignes, récurrentes, budgets,
 * réglages) sont petites et chargées en entier. Les **dépenses** ne le sont
 * pas : seule l'année sélectionnée est en mémoire, ce qui suffit à tous les
 * écrans — mois, analyses et vue annuelle — sans jamais charger la base
 * complète.
 */

interface DataContextValue {
  ready: boolean
  year: number
  month: number
  categories: Category[]
  merchants: Merchant[]
  recurring: RecurringExpense[]
  budgets: MonthBudget[]
  /** Dépenses de l'année sélectionnée. */
  expenses: Expense[]
  settings: AppSettings | null
  setPeriod: (year: number, month: number) => void
  shiftPeriod: (deltaMonths: number) => void
  goToToday: () => void
  categoryName: (id: string) => string | undefined
  merchantName: (id: string) => string | undefined
  categoryById: (id: string) => Category | undefined
  budgetFor: (year: number, month: number) => MonthBudget | undefined
  /** Recharge tout depuis IndexedDB après une écriture. */
  refresh: () => Promise<void>
  updateSettings: (patch: Partial<Omit<AppSettings, 'id'>>) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [ready, setReady] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
  const [budgets, setBudgets] = useState<MonthBudget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)

  const load = useCallback(async (targetYear: number) => {
    const [nextCategories, nextMerchants, nextRecurring, nextBudgets, nextExpenses, nextSettings] =
      await Promise.all([
        categoryRepository.all(),
        merchantRepository.all(),
        recurringRepository.all(),
        monthBudgetRepository.all(),
        expenseRepository.forYear(targetYear),
        settingsRepository.get(),
      ])
    setCategories(nextCategories)
    setMerchants(nextMerchants)
    setRecurring(nextRecurring)
    setBudgets(nextBudgets)
    setExpenses(nextExpenses)
    setSettings(nextSettings)
  }, [])

  // Amorçage : listes de référence, jeu de démonstration au premier lancement,
  // puis demande de stockage persistant.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await bootstrap()
      // Sans attendre la réponse : la permission peut être refusée, l'app
      // fonctionne quand même (les Réglages affichent l'état réel).
      void requestPersistentStorage()
      if (cancelled) return
      await load(new Date().getFullYear())
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  // Changement d'année : on recharge la fenêtre de dépenses.
  useEffect(() => {
    if (!ready) return
    void expenseRepository.forYear(year).then(setExpenses)
  }, [year, ready])

  const refresh = useCallback(async () => {
    await load(year)
  }, [load, year])

  const setPeriod = useCallback((nextYear: number, nextMonth: number) => {
    setYear(nextYear)
    setMonth(nextMonth)
  }, [])

  const shiftPeriod = useCallback(
    (delta: number) => {
      const index = year * 12 + (month - 1) + delta
      setYear(Math.floor(index / 12))
      setMonth((index % 12) + 1)
    },
    [year, month],
  )

  const goToToday = useCallback(() => {
    const today = new Date()
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
  }, [])

  const updateSettings = useCallback(async (patch: Partial<Omit<AppSettings, 'id'>>) => {
    setSettings(await settingsRepository.update(patch))
  }, [])

  const categoryIndex = useMemo(
    () => new Map(categories.map((item) => [item.id, item])),
    [categories],
  )
  const merchantIndex = useMemo(
    () => new Map(merchants.map((item) => [item.id, item])),
    [merchants],
  )
  const budgetIndex = useMemo(() => new Map(budgets.map((item) => [item.id, item])), [budgets])

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      year,
      month,
      categories,
      merchants,
      recurring,
      budgets,
      expenses,
      settings,
      setPeriod,
      shiftPeriod,
      goToToday,
      categoryName: (id) => categoryIndex.get(id)?.name,
      merchantName: (id) => merchantIndex.get(id)?.name,
      categoryById: (id) => categoryIndex.get(id),
      budgetFor: (y, m) => budgetIndex.get(`${y}-${String(m).padStart(2, '0')}`),
      refresh,
      updateSettings,
    }),
    [
      ready, year, month, categories, merchants, recurring, budgets, expenses, settings,
      setPeriod, shiftPeriod, goToToday, categoryIndex, merchantIndex, budgetIndex,
      refresh, updateSettings,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData doit être utilisé dans un DataProvider')
  return context
}
