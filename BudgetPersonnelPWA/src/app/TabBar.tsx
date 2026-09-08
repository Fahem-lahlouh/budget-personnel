import { Icon } from '@/design-system/Icon'
import { haptic } from '@/utils/haptics'
import './TabBar.css'

export type TabId = 'dashboard' | 'expenses' | 'analytics' | 'settings'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Mois', icon: 'grid' },
  { id: 'expenses', label: 'Dépenses', icon: 'list' },
  { id: 'analytics', label: 'Analyses', icon: 'chart' },
  { id: 'settings', label: 'Réglages', icon: 'settings' },
]

interface TabBarProps {
  active: TabId
  onSelect: (tab: TabId) => void
  onAdd: () => void
}

/**
 * Barre d'onglets basse, comme une app iOS native.
 *
 * Le bouton « + » central occupe la place la plus accessible au pouce : c'est
 * l'action de loin la plus fréquente. Le rembourrage bas suit
 * `safe-area-inset-bottom` pour ne pas passer sous la barre Home.
 */
export function TabBar({ active, onSelect, onAdd }: TabBarProps) {
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)]

  const renderTab = (tab: (typeof TABS)[number]) => {
    const selected = active === tab.id
    return (
      <button
        key={tab.id}
        type="button"
        className={`tabbar__tab ${selected ? 'is-active' : ''}`}
        aria-current={selected ? 'page' : undefined}
        onClick={() => {
          haptic('light')
          onSelect(tab.id)
        }}
      >
        <Icon name={tab.icon} size={22} filled={selected} strokeWidth={selected ? 0 : 1.7} />
        <span>{tab.label}</span>
      </button>
    )
  }

  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {left.map(renderTab)}

      <button
        type="button"
        className="tabbar__add"
        aria-label="Ajouter une dépense"
        onClick={() => {
          haptic('light')
          onAdd()
        }}
      >
        <Icon name="plus" size={26} strokeWidth={2.2} />
      </button>

      {right.map(renderTab)}
    </nav>
  )
}
