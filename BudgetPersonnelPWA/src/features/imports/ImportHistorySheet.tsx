import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { EmptyState } from '@/components/Card'
import { AmountText } from '@/components/AmountText'
import { Icon } from '@/design-system/Icon'
import { importSessionRepository } from '@/repositories'
import type { ImportSession } from '@/models/import'
import { formatLongDate } from '@/services/format'
import '@/features/settings/Settings.css'

/** Réglages → Imports depuis image : historique des OCR passés. */
export function ImportHistorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sessions, setSessions] = useState<ImportSession[]>([])

  useEffect(() => {
    if (!open) return
    void importSessionRepository.all().then(setSessions)
  }, [open])

  return (
    <Sheet open={open} tall title="Imports depuis image" onClose={onClose}>
      <div className="stack" style={{ paddingTop: 10 }}>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<Icon name="download" size={24} />}
            title="Aucun import"
            message="Depuis le bouton + de l’écran Dépenses, choisissez « Importer une image » pour extraire des transactions d’une capture bancaire."
          />
        ) : (
          <ul className="list-rows">
            {sessions.map((session) => (
              <li key={session.id} className="import-history__row">
                <span className="import-history__icon" aria-hidden="true">
                  <Icon name="download" size={16} />
                </span>
                <span className="import-history__text">
                  <span className="import-history__title">
                    Import du {formatLongDate(session.createdAt.slice(0, 10))}
                  </span>
                  <span className="import-history__meta">
                    {session.detectedCount} détectées · {session.addedCount} ajoutées ·{' '}
                    {session.duplicateCount} doublon{session.duplicateCount > 1 ? 's' : ''} ·{' '}
                    {session.ignoredCount} ignorée{session.ignoredCount > 1 ? 's' : ''}
                  </span>
                </span>
                <AmountText amount={session.totalAmountAdded} privacyKey="expenseAmounts" size="row" tone="muted" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
