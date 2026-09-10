import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import './Toast.css'

type Tone = 'neutral' | 'success' | 'error'

/** Bouton posé dans le bandeau, pour revenir sur ce qui vient d'être fait. */
export interface ToastAction {
  label: string
  onAct: () => void
}

interface Toast {
  id: number
  message: string
  tone: Tone
  action?: ToastAction
}

interface ToastContextValue {
  notify: (message: string, tone?: Tone, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Bandeau de confirmation éphémère, posé au-dessus de la barre d'onglets. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, tone: Tone = 'neutral', action?: ToastAction) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, message, tone, action }])
      // Un bandeau porteur d'une action laisse le temps de la lire et de la
      // viser : deux secondes de plus qu'une simple confirmation.
      window.setTimeout(() => dismiss(id), action ? 6000 : 2800)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* `polite` : la confirmation est annoncée sans couper la lecture. */}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action?.onAct()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast doit être utilisé dans un ToastProvider')
  return context
}
