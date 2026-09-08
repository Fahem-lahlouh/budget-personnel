import { useEffect, useRef, useState } from 'react'
import { useData } from '@/app/DataContext'
import { useLock } from '@/app/LockContext'
import { useToast } from '@/app/ToastContext'
import { Card, SectionHeader } from '@/components/Card'
import { Button } from '@/components/Button'
import { Segmented, Switch } from '@/components/Field'
import { Icon } from '@/design-system/Icon'
import { pinService } from '@/services/crypto'
import { isPlatformAuthenticatorAvailable, webauthnService } from '@/services/webauthn'
import { buildCsv, csvBlob, csvFileName } from '@/services/csv'
import {
  backupFileName,
  createBackup,
  restoreBackup,
  validateBackup,
  type BackupSummary,
} from '@/services/backup'
import { downloadBlob, readJsonFile } from '@/utils/download'
import { resetToDemoData, wipeAllData } from '@/repositories'
import { storageEstimate, requestPersistentStorage } from '@/repositories/db'
import { bytes, plural } from '@/services/format'
import type { ThemePreference } from '@/models/types'
import { PinSetupSheet } from '@/features/security/PinSetupSheet'
import { ListEditorSheet } from './ListEditorSheet'
import { RecurringSheet } from '@/features/recurring/RecurringSheet'
import { AboutSheet } from './AboutSheet'
import './Settings.css'

type Dialog =
  | null
  | { kind: 'wipe' }
  | { kind: 'reseed' }
  | { kind: 'import'; summary: BackupSummary; apply: () => Promise<void> }

/** Écran des réglages. */
export function SettingsScreen() {
  const data = useData()
  const lock = useLock()
  const { notify } = useToast()

  const [listSheet, setListSheet] = useState<'categories' | 'merchants' | null>(null)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [pinSheet, setPinSheet] = useState<'create' | 'change' | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [biometricsAvailable, setBiometricsAvailable] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void storageEstimate().then(setStorage)
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
    void isPlatformAuthenticatorAvailable().then(setBiometricsAvailable)
  }, [])

  const settings = data.settings
  if (!settings) return null

  // MARK: Confidentialité

  const toggleLock = async (enabled: boolean) => {
    if (enabled) {
      setPinSheet('create')
      return
    }
    await pinService.clear()
    await webauthnService.clear()
    await data.updateSettings({ lockEnabled: false, biometricsEnabled: false })
    notify('Verrouillage désactivé')
  }

  const toggleBiometrics = async (enabled: boolean) => {
    if (!enabled) {
      await webauthnService.clear()
      await data.updateSettings({ biometricsEnabled: false })
      return
    }
    const success = await webauthnService.enroll()
    if (success) {
      await data.updateSettings({ biometricsEnabled: true })
      notify('Déverrouillage biométrique activé', 'success')
    } else {
      notify('Enregistrement biométrique annulé ou indisponible', 'error')
    }
  }

  // MARK: Données

  const exportCsv = (includeConfidential: boolean) => {
    const csv = buildCsv({
      expenses: data.expenses,
      categories: data.categories,
      merchants: data.merchants,
      includeConfidential,
    })
    downloadBlob(csvBlob(csv), csvFileName())
    notify('Export CSV créé', 'success')
  }

  const exportBackup = async () => {
    const backup = await createBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    downloadBlob(blob, backupFileName())
    notify('Sauvegarde créée', 'success')
  }

  const pickBackup = async (file: File) => {
    try {
      const parsed = await readJsonFile(file)
      const result = validateBackup(parsed)
      if (!result.ok) {
        notify(result.error, 'error')
        return
      }
      setDialog({
        kind: 'import',
        summary: result.summary,
        apply: async () => {
          await restoreBackup(result.backup)
          await data.refresh()
          notify('Sauvegarde restaurée', 'success')
        },
      })
    } catch {
      notify('Fichier illisible : ce n’est pas un JSON valide.', 'error')
    }
  }

  const enablePersistence = async () => {
    const granted = await requestPersistentStorage()
    setPersisted(granted)
    notify(
      granted
        ? 'Stockage persistant accordé'
        : 'Le navigateur a refusé le stockage persistant. Gardez une sauvegarde JSON.',
      granted ? 'success' : 'error',
    )
  }

  return (
    <div className="screen">
      <header className="screen__header">
        <h1 className="screen__title">Réglages</h1>
      </header>

      <div className="stack">
        {/* Confidentialité */}
        <Card>
          <div className="stack">
            <SectionHeader title="Confidentialité" />

            <Switch
              label="Verrouiller l’app par code"
              description="Code à 6 chiffres demandé à l’ouverture."
              checked={settings.lockEnabled}
              onChange={(value) => void toggleLock(value)}
            />

            {settings.lockEnabled ? (
              <>
                <button
                  type="button"
                  className="settings__row"
                  onClick={() => setPinSheet('change')}
                >
                  <Icon name="key" size={18} />
                  <span>Modifier le code PIN</span>
                  <Icon name="chevronRight" size={16} />
                </button>

                <Switch
                  label="Déverrouiller avec Face ID / Touch ID"
                  description={
                    biometricsAvailable
                      ? 'Utilise l’authentificateur de l’appareil via WebAuthn.'
                      : 'Aucun authentificateur biométrique détecté sur cet appareil ou ce navigateur.'
                  }
                  checked={settings.biometricsEnabled}
                  disabled={!biometricsAvailable}
                  onChange={(value) => void toggleBiometrics(value)}
                />
              </>
            ) : null}

            <Switch
              label="Second niveau pour les dépenses confidentielles"
              description="Les dépenses marquées « Confidentiel » restent masquées après le déverrouillage global."
              checked={settings.secondLevelForConfidential}
              onChange={(value) => {
                void data.updateSettings({ secondLevelForConfidential: value })
                lock.applySettings({ ...settings, secondLevelForConfidential: value })
              }}
            />

            <p className="settings__note">
              Le code est enregistré haché (PBKDF2-SHA256, sel aléatoire), jamais en clair. Il
              protège l’affichage des montants ; il ne chiffre pas la base — voir « À propos ».
            </p>
          </div>
        </Card>

        {/* Listes */}
        <Card flush>
          <div className="settings__group-title">
            <SectionHeader title="Listes" />
          </div>
          <ul className="list-rows">
            <li>
              <button type="button" className="settings__row" onClick={() => setListSheet('categories')}>
                <Icon name="grid" size={18} />
                <span>Catégories</span>
                <span className="settings__value tnum">{data.categories.length}</span>
                <Icon name="chevronRight" size={16} />
              </button>
            </li>
            <li>
              <button type="button" className="settings__row" onClick={() => setListSheet('merchants')}>
                <Icon name="store" size={18} />
                <span>Enseignes</span>
                <span className="settings__value tnum">{data.merchants.length}</span>
                <Icon name="chevronRight" size={16} />
              </button>
            </li>
            <li>
              <button type="button" className="settings__row" onClick={() => setRecurringOpen(true)}>
                <Icon name="repeat" size={18} />
                <span>Dépenses récurrentes</span>
                <span className="settings__value tnum">
                  {data.recurring.filter((item) => item.active).length}
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            </li>
          </ul>
        </Card>

        {/* Apparence */}
        <Card>
          <div className="stack">
            <SectionHeader title="Apparence" />
            <Segmented<ThemePreference>
              value={settings.theme}
              onChange={(value) => void data.updateSettings({ theme: value })}
              options={[
                { value: 'system', label: 'Automatique' },
                { value: 'light', label: 'Clair' },
                { value: 'dark', label: 'Sombre' },
              ]}
            />
          </div>
        </Card>

        {/* Sauvegarde */}
        <Card>
          <div className="stack">
            <SectionHeader title="Sauvegarde" subtitle="Vos données, sous votre contrôle" />

            <p className="settings__note settings__note--strong">
              Une PWA n’offre pas les mêmes garanties de conservation qu’une app installée :
              effacer les données de navigation, ou laisser l’app inutilisée plusieurs semaines,
              peut faire disparaître la base. Exportez une sauvegarde régulièrement.
            </p>

            <Button variant="soft" block icon={<Icon name="download" size={17} />} onClick={() => void exportBackup()}>
              Exporter une sauvegarde (JSON)
            </Button>

            <Button
              variant="soft"
              block
              icon={<Icon name="upload" size={17} />}
              onClick={() => fileInput.current?.click()}
            >
              Restaurer une sauvegarde
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void pickBackup(file)
                event.target.value = ''
              }}
            />

            <div className="settings__divider" />

            <Button variant="ghost" block icon={<Icon name="download" size={17} />} onClick={() => exportCsv(true)}>
              Exporter en CSV (Excel)
            </Button>
            <Button variant="ghost" block onClick={() => exportCsv(false)}>
              Exporter en CSV sans les dépenses confidentielles
            </Button>
          </div>
        </Card>

        {/* Stockage */}
        <Card>
          <div className="stack">
            <SectionHeader title="Stockage" />
            <div className="settings__stat">
              <span>Espace utilisé</span>
              <span className="tnum">
                {storage ? bytes(storage.usage) : '—'}
                {storage && storage.quota > 0 ? ` / ${bytes(storage.quota)}` : ''}
              </span>
            </div>
            <div className="settings__stat">
              <span>Stockage persistant</span>
              <span>{persisted === null ? 'Inconnu' : persisted ? 'Accordé' : 'Non accordé'}</span>
            </div>
            {persisted === false ? (
              <Button variant="soft" block onClick={() => void enablePersistence()}>
                Demander le stockage persistant
              </Button>
            ) : null}
          </div>
        </Card>

        {/* Données */}
        <Card>
          <div className="stack">
            <SectionHeader title="Mes données" />
            <Button variant="ghost" block icon={<Icon name="sparkle" size={17} />} onClick={() => setDialog({ kind: 'reseed' })}>
              Réinitialiser les données de démonstration
            </Button>
            <Button variant="danger" block icon={<Icon name="trash" size={17} />} onClick={() => setDialog({ kind: 'wipe' })}>
              Tout effacer
            </Button>
            <p className="settings__note">
              {data.expenses.length} {plural(data.expenses.length, 'dépense')} sur {data.year}.
              Toutes vos données restent sur cet appareil : aucun compte, aucun serveur, aucune
              synchronisation.
            </p>
          </div>
        </Card>

        {/* À propos */}
        <Card flush>
          <ul className="list-rows">
            <li>
              <button type="button" className="settings__row" onClick={() => setAboutOpen(true)}>
                <Icon name="info" size={18} />
                <span>À propos et limites</span>
                <Icon name="chevronRight" size={16} />
              </button>
            </li>
          </ul>
        </Card>
      </div>

      {/* Feuilles */}
      <ListEditorSheet
        open={listSheet !== null}
        kind={listSheet ?? 'categories'}
        onClose={() => setListSheet(null)}
      />
      <RecurringSheet open={recurringOpen} onClose={() => setRecurringOpen(false)} />
      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <PinSetupSheet
        open={pinSheet !== null}
        mode={pinSheet ?? 'create'}
        onClose={() => setPinSheet(null)}
        onDone={() => {
          if (pinSheet === 'create') {
            void data.updateSettings({ lockEnabled: true })
            notify('Verrouillage activé', 'success')
          } else {
            notify('Code modifié', 'success')
          }
        }}
      />

      {/* Confirmations */}
      {dialog ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-box">
            {dialog.kind === 'wipe' ? (
              <>
                <h2>Tout effacer ?</h2>
                <p>
                  Toutes vos dépenses, récurrentes et salaires seront supprimés définitivement.
                  Exportez d’abord une sauvegarde si vous souhaitez les conserver.
                </p>
              </>
            ) : dialog.kind === 'reseed' ? (
              <>
                <h2>Recharger la démonstration ?</h2>
                <p>
                  Vos données actuelles seront remplacées par le jeu d’exemple sur le mois en
                  cours.
                </p>
              </>
            ) : (
              <>
                <h2>Restaurer cette sauvegarde ?</h2>
                <p>
                  Fichier du{' '}
                  {dialog.summary.exportedAt
                    ? new Date(dialog.summary.exportedAt).toLocaleDateString('fr-FR')
                    : 'date inconnue'}{' '}
                  : {dialog.summary.expenses} dépenses, {dialog.summary.categories} catégories,{' '}
                  {dialog.summary.merchants} enseignes, {dialog.summary.recurring} récurrentes,{' '}
                  {dialog.summary.monthBudgets} budgets mensuels.
                </p>
                <p className="confirm-box__warning">
                  Vos données actuelles seront intégralement remplacées.
                </p>
              </>
            )}

            <div className="confirm-box__actions">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Annuler
              </Button>
              <Button
                variant={dialog.kind === 'import' ? 'primary' : 'danger'}
                onClick={() => {
                  void (async () => {
                    if (dialog.kind === 'wipe') {
                      await wipeAllData()
                      await data.refresh()
                      notify('Données effacées')
                    } else if (dialog.kind === 'reseed') {
                      await resetToDemoData()
                      await data.refresh()
                      notify('Démonstration rechargée', 'success')
                    } else {
                      await dialog.apply()
                    }
                    setDialog(null)
                  })()
                }}
              >
                {dialog.kind === 'import' ? 'Restaurer' : 'Confirmer'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
