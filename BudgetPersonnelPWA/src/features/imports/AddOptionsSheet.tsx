import { Sheet } from '@/components/Sheet'
import { Icon } from '@/design-system/Icon'
import { haptic } from '@/utils/haptics'
import './ImportFlow.css'

interface AddOptionsSheetProps {
  open: boolean
  onClose: () => void
  onManual: () => void
  onImport: () => void
}

/** Choix proposé par le bouton « + » : saisie manuelle ou import depuis une image. */
export function AddOptionsSheet({ open, onClose, onManual, onImport }: AddOptionsSheetProps) {
  return (
    <Sheet open={open} title="Ajouter une dépense" onClose={onClose}>
      <ul className="picker-list">
        <li>
          <button
            type="button"
            className="picker-list__row"
            onClick={() => {
              haptic('light')
              onManual()
            }}
          >
            <Icon name="plus" size={18} />
            <span>Ajouter manuellement</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="picker-list__row"
            onClick={() => {
              haptic('light')
              onImport()
            }}
          >
            <Icon name="upload" size={18} />
            <span>Importer une image (relevé bancaire)</span>
          </button>
        </li>
      </ul>
    </Sheet>
  )
}
