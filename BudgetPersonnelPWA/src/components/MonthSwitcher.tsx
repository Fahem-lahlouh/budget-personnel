import { Icon } from '@/design-system/Icon'
import { IconButton } from './Button'
import { haptic } from '@/utils/haptics'
import { monthLabel } from '@/services/format'
import './MonthSwitcher.css'

interface MonthSwitcherProps {
  year: number
  month: number
  onShift: (delta: number) => void
  onToday: () => void
  isCurrent: boolean
}

export function MonthSwitcher({ year, month, onShift, onToday, isCurrent }: MonthSwitcherProps) {
  return (
    <div className="month-switcher">
      <IconButton
        label="Mois précédent"
        tone="neutral"
        onClick={() => {
          haptic('light')
          onShift(-1)
        }}
      >
        <Icon name="chevronLeft" size={18} />
      </IconButton>

      <div className="month-switcher__label">
        <span className="month-switcher__month">{monthLabel(year, month)}</span>
        {!isCurrent ? (
          <button type="button" className="month-switcher__today" onClick={onToday}>
            Revenir à aujourd’hui
          </button>
        ) : null}
      </div>

      <IconButton
        label="Mois suivant"
        tone="neutral"
        onClick={() => {
          haptic('light')
          onShift(1)
        }}
      >
        <Icon name="chevronRight" size={18} />
      </IconButton>
    </div>
  )
}
