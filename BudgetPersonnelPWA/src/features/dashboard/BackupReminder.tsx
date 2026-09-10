import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Icon } from '@/design-system/Icon'
import { useData } from '@/app/DataContext'
import { backupFreshness, BACKUP_STALE_DAYS } from '@/services/backup'

interface BackupReminderProps {
  onOpenSettings: () => void
}

/**
 * Rappel de sauvegarde, sur le tableau de bord.
 *
 * La perte totale est le seul risque que l'app ne peut pas rattraper : le
 * navigateur peut évincer la base d'un site resté inutilisé, et l'avertissement
 * enfoui dans les Réglages n'est lu que par qui les ouvre. Le rappel se montre
 * donc là où on passe tous les jours.
 *
 * Il n'est pas fermable, mais il n'a pas à l'être : il n'apparaît que lorsque
 * la sauvegarde manque vraiment, et disparaît de lui-même dès l'export. Un
 * bandeau qu'on peut faire taire sans agir ne protège de rien.
 */
export function BackupReminder({ onOpenSettings }: BackupReminderProps) {
  const data = useData()
  const { state, days } = backupFreshness(
    data.settings?.lastBackupAt ?? null,
    data.expenses.length,
  )

  if (state === 'fresh') return null

  return (
    <Card>
      <div className="backup-reminder">
        <span className="backup-reminder__icon">
          <Icon name="shield" size={20} />
        </span>
        <div className="backup-reminder__text">
          <strong>
            {state === 'never' ? 'Aucune sauvegarde' : `Sauvegarde vieille de ${days} jours`}
          </strong>
          <p>
            {state === 'never'
              ? 'Vos données n’existent que sur cet appareil. Exportez-les pour ne rien risquer.'
              : `Plus de ${BACKUP_STALE_DAYS} jours sans export. Une nouvelle sauvegarde prend quelques secondes.`}
          </p>
        </div>
        <Button variant="soft" onClick={onOpenSettings}>
          Sauvegarder
        </Button>
      </div>
    </Card>
  )
}
