import { Sheet } from '@/components/Sheet'
import { Switch } from '@/components/Field'
import { useData } from '@/app/DataContext'
import { PRIVACY_KEYS, PRIVACY_KEY_LABELS, type PrivacyKey } from '@/models/types'
import './Settings.css'

const DESCRIPTIONS: Partial<Record<PrivacyKey, string>> = {
  salary: 'Masque le salaire du mois sur le tableau de bord et la vue annuelle.',
  remaining: 'Masque le reste disponible.',
  realSavings: 'Masque l’épargne réelle.',
  totalSpent: 'Masque le total dépensé.',
  budgetGoal: 'Masque l’objectif d’épargne.',
  expenseAmounts: 'Masque le montant de chaque dépense dans les listes.',
  confidentialExpenses:
    'Concerne uniquement les dépenses que vous marquez « Confidentiel » individuellement.',
  percentages: 'Masque les pourcentages (« 71 % du salaire »), qui peuvent trahir un montant.',
}

/**
 * Réglages → Confidentialité.
 *
 * Chaque catégorie de montant s'active ou se désactive indépendamment. La
 * feuille elle-même n'est ouverte qu'après confirmation du code (voir
 * `SettingsScreen`) : une fois dedans, les bascules ne redemandent pas le
 * code à chaque case, sans quoi cocher les huit reviendrait à ressaisir le
 * code huit fois.
 */
export function PrivacyFieldsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData()
  const settings = data.settings
  if (!settings) return null

  const toggle = (key: PrivacyKey, value: boolean) => {
    void data.updateSettings({
      protectedFields: { ...settings.protectedFields, [key]: value },
    })
  }

  return (
    <Sheet open={open} tall title="Confidentialité" onClose={onClose}>
      <div className="stack" style={{ paddingTop: 10 }}>
        <p className="settings__note">
          Un champ protégé s’affiche en <code>•••• €</code> jusqu’à ce que vous entriez votre
          code pour le consulter. Le bouton œil du tableau de bord révèle ou masque tout d’un
          coup ; chaque montant reste aussi consultable individuellement.
        </p>

        <div className="stack" style={{ gap: 2 }}>
          {PRIVACY_KEYS.map((key) => (
            <Switch
              key={key}
              label={PRIVACY_KEY_LABELS[key]}
              description={DESCRIPTIONS[key]}
              checked={settings.protectedFields[key]}
              onChange={(value) => toggle(key, value)}
            />
          ))}
        </div>
      </div>
    </Sheet>
  )
}
