import { useEffect, useRef, useState } from 'react'
import { useData } from '@/app/DataContext'
import { useLock } from '@/app/LockContext'
import { useToast } from '@/app/ToastContext'
import { useSecurityGate } from '@/app/useSecurityGate'
import { Card, SectionHeader } from '@/components/Card'
import { Button } from '@/components/Button'
import { RadioList, Segmented, Switch } from '@/components/Field'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Icon } from '@/design-system/Icon'
import { pinService } from '@/services/crypto'
import { isPlatformAuthenticatorAvailable, webauthnService } from '@/services/webauthn'
import { buildCsv, csvBlob, csvFileName } from '@/services/csv'
import {
  backupFileName,
  backupFreshness,
  createBackup,
  restoreBackup,
  validateBackup,
  type BackupSummary,
} from '@/services/backup'
import { downloadBlob, readJsonFile } from '@/utils/download'
import { resetToDemoData, wipeAllData } from '@/repositories'
import { storageEstimate, requestPersistentStorage } from '@/repositories/db'
import { receiptImageRepository } from '@/repositories'
import { bytes, plural } from '@/services/format'
import {
  UNLOCK_DURATIONS,
  UNLOCK_DURATION_LABELS,
  type PinLength,
  type ThemePreference,
  type UnlockDuration,
} from '@/models/types'
import { PinSetupSheet } from '@/features/security/PinSetupSheet'
import { ListEditorSheet } from './ListEditorSheet'
import { RecurringSheet } from '@/features/recurring/RecurringSheet'
import { AboutSheet } from './AboutSheet'
import { PrivacyFieldsSheet } from './PrivacyFieldsSheet'
import { ImportHistorySheet } from '@/features/imports/ImportHistorySheet'
import './Settings.css'

/** Ce que chaque confirmation annonce. Regroupé pour parler d'une seule voix. */
const DIALOG_COPY: Record<
  'wipe' | 'reseed' | 'deletePhotos' | 'import',
  { title: string; confirmLabel: string; warning?: string }
> = {
  wipe: {
    title: 'Tout effacer ?',
    confirmLabel: 'Tout effacer',
    warning: 'Cette action est irréversible.',
  },
  reseed: {
    title: 'Recharger la démonstration ?',
    confirmLabel: 'Recharger',
    warning: 'Vos données actuelles seront remplacées.',
  },
  deletePhotos: {
    title: 'Supprimer les photos ?',
    confirmLabel: 'Supprimer',
    warning: 'Cette action est irréversible.',
  },
  import: {
    title: 'Restaurer cette sauvegarde ?',
    confirmLabel: 'Restaurer',
    warning: 'Vos données actuelles seront intégralement remplacées.',
  },
}

type Dialog =
  | null
  | { kind: 'wipe' }
  | { kind: 'reseed' }
  | { kind: 'deletePhotos'; count: number }
  | { kind: 'import'; summary: BackupSummary; apply: () => Promise<void> }

/** Écran des réglages. */
function describeDialog(dialog: NonNullable<Dialog>): string {
  if (dialog.kind === 'wipe') {
    return 'Toutes vos dépenses, récurrentes et salaires seront supprimés. Exportez d’abord une sauvegarde si vous souhaitez les conserver.'
  }
  if (dialog.kind === 'reseed') {
    return 'Vos données actuelles seront remplacées par le jeu d’exemple sur le mois en cours.'
  }
  if (dialog.kind === 'deletePhotos') {
    const plural = dialog.count > 1
    return `${dialog.count} photo${plural ? 's' : ''} de ticket. Les articles et montants déjà extraits sont conservés : seule l’image disparaît.`
  }
  const date = dialog.summary.exportedAt
    ? new Date(dialog.summary.exportedAt).toLocaleDateString('fr-FR')
    : 'date inconnue'
  return `Fichier du ${date} : ${dialog.summary.expenses} dépenses, ${dialog.summary.categories} catégories, ${dialog.summary.merchants} enseignes, ${dialog.summary.recurring} récurrentes, ${dialog.summary.monthBudgets} budgets mensuels.`
}

export function SettingsScreen() {
  const data = useData()
  const lock = useLock()
  const { notify } = useToast()
  const requireConfirm = useSecurityGate()

  const [listSheet, setListSheet] = useState<'categories' | 'merchants' | null>(null)
  const [recurringOpen, setRecurringOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [importsOpen, setImportsOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [pinSheet, setPinSheet] = useState<{ mode: 'create' | 'change'; newLength: PinLength } | null>(
    null,
  )
  const [dialog, setDialog] = useState<Dialog>(null)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [photos, setPhotos] = useState<{ count: number; bytes: number } | null>(null)

  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [biometricsAvailable, setBiometricsAvailable] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void storageEstimate().then(setStorage)
    void Promise.all([receiptImageRepository.count(), receiptImageRepository.totalBytes()]).then(
      ([count, byteSize]) => setPhotos({ count, bytes: byteSize }),
    )
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
    void isPlatformAuthenticatorAvailable().then(setBiometricsAvailable)
  }, [])

  const settings = data.settings
  if (!settings) return null

  const freshness = backupFreshness(settings.lastBackupAt, data.expenses.length)
  const lastBackupLabel = settings.lastBackupAt
    ? `${new Date(settings.lastBackupAt).toLocaleDateString('fr-FR')}${
        freshness.days ? ` · il y a ${freshness.days} j` : ' · aujourd’hui'
      }`
    : 'Jamais'

  // MARK: Sécurité — chaque changement sensible passe par `requireConfirm()`.
  // Sans code déjà configuré, la garde s'efface d'elle-même (rien à protéger).

  const toggleLock = async (enabled: boolean) => {
    if (enabled) {
      setPinSheet({ mode: 'create', newLength: settings.pinLength })
      return
    }
    if (!(await requireConfirm())) return
    await pinService.clear()
    await webauthnService.clear()
    await data.updateSettings({ lockEnabled: false, biometricsEnabled: false })
    lock.applySettings({ ...settings, lockEnabled: false })
    notify('Verrouillage désactivé')
  }

  const changePin = async () => {
    if (!(await requireConfirm())) return
    setPinSheet({ mode: 'change', newLength: settings.pinLength })
  }

  const changePinLength = async (length: PinLength) => {
    if (length === settings.pinLength) return
    if (!(await requireConfirm())) return
    if (settings.lockEnabled) {
      // Le code existant doit être ressaisi (à son ancienne longueur) avant
      // d'en choisir un nouveau à la longueur choisie.
      setPinSheet({ mode: 'change', newLength: length })
    } else {
      // Pas encore de code : rien à reconfirmer, la longueur s'applique
      // simplement au prochain code créé.
      await data.updateSettings({ pinLength: length })
    }
  }

  const changeUnlockDuration = async (duration: UnlockDuration) => {
    if (duration === settings.unlockDuration) return
    if (!(await requireConfirm())) return
    await data.updateSettings({ unlockDuration: duration })
  }

  const openPrivacyFields = async () => {
    if (!(await requireConfirm())) return
    setPrivacyOpen(true)
  }

  const toggleBiometrics = async (enabled: boolean) => {
    if (!enabled) {
      if (!(await requireConfirm())) return
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
    // La date n'est retenue qu'ici : un export CSV est lisible mais partiel,
    // il ne permettrait pas de remonter la base et ne met donc rien à l'abri.
    await data.updateSettings({ lastBackupAt: backup.exportedAt })
    notify('Sauvegarde créée', 'success')
  }

  const pickBackup = async (file: File) => {
    if (!(await requireConfirm())) return
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
          // Les données en place sont désormais celles du fichier : la
          // dernière mise à l'abri remonte donc à sa date d'export, pas à
          // aujourd'hui.
          await data.updateSettings({ lastBackupAt: result.summary.exportedAt || null })
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

  const askWipe = async () => {
    if (!(await requireConfirm())) return
    setDialog({ kind: 'wipe' })
  }

  const askReseed = async () => {
    if (!(await requireConfirm())) return
    setDialog({ kind: 'reseed' })
  }

  const askDeletePhotos = async () => {
    if (!photos || photos.count === 0) return
    if (!(await requireConfirm())) return
    setDialog({ kind: 'deletePhotos', count: photos.count })
  }

  return (
    <div className="screen">
      <header className="screen__header">
        <h1 className="screen__title">Réglages</h1>
      </header>

      <div className="stack">
        {/* Sécurité */}
        <Card>
          <div className="stack">
            <SectionHeader title="Sécurité" />

            <Switch
              label="Verrouiller l’app par code"
              description={`Code à ${settings.pinLength} chiffres demandé à l’ouverture.`}
              checked={settings.lockEnabled}
              onChange={(value) => void toggleLock(value)}
            />

            {settings.lockEnabled ? (
              <>
                <button type="button" className="settings__row" onClick={() => void changePin()}>
                  <Icon name="key" size={18} />
                  <span>Modifier le code</span>
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

            <div className="field">
              <span className="field__label">Longueur du code</span>
              <Segmented<'4' | '6'>
                value={String(settings.pinLength) as '4' | '6'}
                onChange={(value) => void changePinLength(Number(value) as PinLength)}
                options={[
                  { value: '4', label: '4 chiffres' },
                  { value: '6', label: '6 chiffres' },
                ]}
              />
            </div>

            <p className="settings__note">
              Le code est enregistré haché (PBKDF2-SHA256, sel aléatoire), jamais en clair. Il
              protège l’affichage des montants ; il ne chiffre pas la base — voir « À propos ».
            </p>
          </div>
        </Card>

        {/* Confidentialité */}
        <Card flush>
          <div className="settings__group-title">
            <SectionHeader
              title="Confidentialité"
              subtitle="Choisissez ce qui reste masqué tant que vous ne le révélez pas"
            />
          </div>
          <ul className="list-rows">
            <li>
              <button type="button" className="settings__row" onClick={() => void openPrivacyFields()}>
                <Icon name="eyeOff" size={18} />
                <span>Champs protégés</span>
                <span className="settings__value tnum">
                  {Object.values(settings.protectedFields).filter(Boolean).length}
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            </li>
          </ul>
          <div className="settings__group-title" style={{ paddingTop: 4 }}>
            <span className="field__label">Durée de révélation</span>
          </div>
          <div style={{ padding: '0 var(--pad-card) 14px' }}>
            <RadioList<UnlockDuration>
              value={settings.unlockDuration}
              onChange={(value) => void changeUnlockDuration(value)}
              options={UNLOCK_DURATIONS.map((value) => ({
                value,
                label: UNLOCK_DURATION_LABELS[value],
              }))}
            />
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
            <li>
              <button type="button" className="settings__row" onClick={() => setImportsOpen(true)}>
                <Icon name="download" size={18} />
                <span>Imports depuis image</span>
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

            <div className="settings__stat">
              <span>Dernière sauvegarde</span>
              <span className={freshness.state === 'fresh' ? '' : 'settings__stat--warning'}>
                {lastBackupLabel}
              </span>
            </div>

            <p
              className={`settings__note ${freshness.state === 'fresh' ? '' : 'settings__note--strong'}`}
            >
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

            <Switch
              label="Conserver la photo des tickets"
              description="Coupé, les tickets sont toujours lus et détaillés, mais la photo est jetée après lecture."
              checked={settings.keepReceiptImages}
              onChange={(checked) => void data.updateSettings({ keepReceiptImages: checked })}
            />

            {photos && photos.count > 0 ? (
              <>
                <div className="settings__stat">
                  <span>Photos de tickets</span>
                  <span className="tnum">
                    {photos.count} · {bytes(photos.bytes)}
                  </span>
                </div>
                {/* Supprimer les photos ne touche pas aux articles déjà
                    extraits : on récupère de la place sans perdre le détail. */}
                <Button variant="ghost" block onClick={() => void askDeletePhotos()}>
                  Supprimer les photos conservées
                </Button>
              </>
            ) : null}
          </div>
        </Card>

        {/* Données */}
        <Card>
          <div className="stack">
            <SectionHeader title="Mes données" />
            <Button variant="ghost" block icon={<Icon name="sparkle" size={17} />} onClick={() => void askReseed()}>
              Réinitialiser les données de démonstration
            </Button>
            <Button variant="danger" block icon={<Icon name="trash" size={17} />} onClick={() => void askWipe()}>
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
      <PrivacyFieldsSheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <ImportHistorySheet open={importsOpen} onClose={() => setImportsOpen(false)} />
      <PinSetupSheet
        open={pinSheet !== null}
        mode={pinSheet?.mode ?? 'create'}
        currentLength={settings.pinLength}
        newLength={pinSheet?.newLength ?? settings.pinLength}
        onClose={() => setPinSheet(null)}
        onDone={() => {
          const wasCreate = pinSheet?.mode === 'create'
          const newLength = pinSheet?.newLength ?? settings.pinLength
          void data.updateSettings({
            lockEnabled: true,
            pinLength: newLength,
          })
          notify(wasCreate ? 'Verrouillage activé' : 'Code modifié', 'success')
        }}
      />

      {/* Confirmations — toutes passent par la même modale. */}
      <ConfirmDialog
        open={dialog !== null}
        title={dialog ? DIALOG_COPY[dialog.kind].title : ''}
        message={dialog ? describeDialog(dialog) : undefined}
        warning={dialog ? DIALOG_COPY[dialog.kind].warning : undefined}
        confirmLabel={dialog ? DIALOG_COPY[dialog.kind].confirmLabel : ''}
        destructive={dialog?.kind !== 'import'}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (!dialog) return
          void (async () => {
            if (dialog.kind === 'wipe') {
              await wipeAllData()
              await data.refresh()
              notify('Données effacées')
            } else if (dialog.kind === 'reseed') {
              await resetToDemoData()
              await data.refresh()
              notify('Démonstration rechargée', 'success')
            } else if (dialog.kind === 'deletePhotos') {
              await receiptImageRepository.removeAll()
              setPhotos({ count: 0, bytes: 0 })
              await data.refresh()
              notify('Photos supprimées')
            } else {
              await dialog.apply()
            }
            setDialog(null)
          })()
        }}
      />
    </div>
  )
}
