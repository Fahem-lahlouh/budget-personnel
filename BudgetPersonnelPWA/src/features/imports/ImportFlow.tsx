import { useCallback, useRef, useState } from 'react'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { Sheet } from '@/components/Sheet'
import { Card, EmptyState, SectionHeader, TagChip } from '@/components/Card'
import { Button } from '@/components/Button'
import { AmountInput, DateField } from '@/components/Field'
import { Icon } from '@/design-system/Icon'
import { haptic } from '@/utils/haptics'
import {
  expenseRepository,
  merchantRepository,
  importSessionRepository,
  importedTransactionRepository,
  merchantAliasRepository,
  categorizationRuleRepository,
} from '@/repositories'
import { preprocessImageForOcr } from '@/services/ocr/imagePreprocess'
import { runOcr, OcrCancelledError, type OcrRunHandle } from '@/services/ocr/tesseractClient'
import { parseStatementText } from '@/services/ocr/transactionParser'
import { normalizeMerchantLabel } from '@/services/ocr/merchantNormalizer'
import { computeFingerprint } from '@/services/ocr/fingerprint'
import { buildExistingFingerprints, isDuplicateFingerprint } from '@/services/ocr/duplicateDetector'
import { proposeCategorization } from '@/services/ocr/categorizationEngine'
import type { ConfidenceLevel, ImportedTransaction, ImportSession } from '@/models/import'
import type { TransactionKind } from '@/models/import'
import { money } from '@/services/format'
import type { ExpenseType } from '@/models/types'
import './ImportFlow.css'

interface ImportFlowProps {
  open: boolean
  onClose: () => void
}

type Step = 'pick' | 'processing' | 'review' | 'saving'

interface ReviewRow {
  tempId: string
  rawLine: string
  date: string | null
  label: string
  amount: number | null
  kind: TransactionKind
  categoryId: string | null
  merchantId: string | null
  suggestedMerchantName: string | null
  merchantConfidence: ConfidenceLevel
  categoryConfidence: ConfidenceLevel
  fingerprint: string
  isDuplicate: boolean
  decision: 'valider' | 'ignorer'
  memorize: boolean
  editing: boolean
}

function newTempId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `row-${Math.random()}`
}

function canValidateRow(row: ReviewRow): boolean {
  return row.kind !== 'inconnu' && row.categoryId !== null && row.date !== null && !!row.amount && row.amount > 0
}

/**
 * Import de dépenses depuis une photo ou une capture d'écran de relevé
 * bancaire : OCR local (Tesseract.js, aucune image ni texte envoyé où que ce
 * soit), proposition de catégorie/enseigne à partir de ce que l'app a déjà
 * appris, puis un écran de validation ligne à ligne — jamais de dépense créée
 * automatiquement.
 */
export function ImportFlow({ open, onClose }: ImportFlowProps) {
  const data = useData()
  const { notify } = useToast()

  const [step, setStep] = useState<Step>('pick')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'preparing' | 'reading'>('preparing')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [sourceLabel, setSourceLabel] = useState('')
  const ocrHandleRef = useRef<OcrRunHandle | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setStep('pick')
    setProgress(0)
    setPhase('preparing')
    setRows([])
    ocrHandleRef.current = null
  }, [])

  const close = () => {
    ocrHandleRef.current?.cancel()
    reset()
    onClose()
  }

  const onFileChosen = async (file: File) => {
    setSourceLabel(file.name || 'Capture')
    setStep('processing')
    setPhase('preparing')
    setProgress(0)

    try {
      const processed = await preprocessImageForOcr(file)
      setPhase('reading')
      const handle = runOcr(processed, setProgress)
      ocrHandleRef.current = handle
      const text = await handle.result
      ocrHandleRef.current = null

      const parsed = parseStatementText(text, data.year)
      if (parsed.length === 0) {
        notify('Aucune opération reconnue dans cette image.', 'error')
        reset()
        return
      }

      const [rules, aliases, allExpenses, importedFingerprints] = await Promise.all([
        categorizationRuleRepository.all(),
        merchantAliasRepository.all(),
        expenseRepository.all(),
        importedTransactionRepository.allFingerprints(),
      ])
      const existingFingerprints = buildExistingFingerprints(allExpenses, data.merchantName)
      for (const fp of importedFingerprints) existingFingerprints.add(fp)

      const nextRows: ReviewRow[] = parsed.map((line) => {
        const proposal = proposeCategorization(line.label, {
          rules,
          aliases,
          merchants: data.merchants,
          expenses: allExpenses,
        })
        const fingerprint = computeFingerprint(line.date, line.amount, line.label)
        const isDuplicate = isDuplicateFingerprint(fingerprint, existingFingerprints)
        const row: ReviewRow = {
          tempId: newTempId(),
          rawLine: line.rawLine,
          date: line.date,
          label: line.label,
          amount: line.amount,
          kind: line.kind,
          categoryId: proposal.categoryId,
          merchantId: proposal.merchantId,
          suggestedMerchantName: proposal.merchantId ? null : proposal.suggestedMerchantName,
          merchantConfidence: proposal.merchantConfidence,
          categoryConfidence: proposal.categoryConfidence,
          fingerprint,
          isDuplicate,
          decision: 'ignorer',
          memorize: true,
          editing: false,
        }
        row.decision = !isDuplicate && canValidateRow(row) ? 'valider' : 'ignorer'
        return row
      })

      setRows(nextRows)
      setStep('review')
    } catch (error) {
      if (error instanceof OcrCancelledError) {
        reset()
        return
      }
      notify('Échec de la lecture de l’image. Réessayez avec une capture plus nette.', 'error')
      reset()
    }
  }

  const updateRow = (tempId: string, patch: Partial<ReviewRow>) => {
    setRows((current) => current.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row)))
  }

  const selectableRows = rows.filter((row) => !row.isDuplicate && canValidateRow(row))
  const selectedCount = rows.filter((row) => row.decision === 'valider').length

  const selectAll = () => {
    haptic('light')
    setRows((current) =>
      current.map((row) => (canValidateRow(row) ? { ...row, decision: 'valider' } : row)),
    )
  }
  const selectNone = () => {
    haptic('light')
    setRows((current) => current.map((row) => ({ ...row, decision: 'ignorer' })))
  }

  const commit = async () => {
    setStep('saving')
    const importedRows: ImportedTransaction[] = []
    let addedCount = 0
    let totalAmountAdded = 0
    const sessionId = newTempId()

    for (const row of rows) {
      if (row.decision !== 'valider') {
        importedRows.push(toImportedTransaction(row, sessionId, row.isDuplicate ? 'doublon' : 'ignoree', null))
        continue
      }

      let merchantId = row.merchantId
      if (!merchantId && row.suggestedMerchantName) {
        const created = await merchantRepository.create(row.suggestedMerchantName)
        merchantId = created.id
      }

      const expense = await expenseRepository.create({
        date: row.date!,
        categoryId: row.categoryId!,
        merchantId: merchantId ?? '',
        description: row.label,
        amount: row.amount!,
        type: 'variable' as ExpenseType,
        plannedAmount: null,
        status: 'paye',
        note: '',
        confidential: false,
        recurringId: null,
      })
      addedCount += 1
      totalAmountAdded += row.amount!

      if (row.memorize) {
        const normalized = normalizeMerchantLabel(row.label)
        if (merchantId) await merchantAliasRepository.learn(normalized, merchantId)
        if (row.categoryId) {
          await categorizationRuleRepository.learn(normalized, row.categoryId, merchantId)
        }
      }

      importedRows.push(toImportedTransaction(row, sessionId, 'validee', expense.id))
    }

    const session: Omit<ImportSession, 'id'> = {
      createdAt: new Date().toISOString(),
      sourceLabel,
      imageRetained: false,
      detectedCount: rows.length,
      addedCount,
      ignoredCount: rows.filter((r) => r.decision === 'ignorer' && !r.isDuplicate).length,
      duplicateCount: rows.filter((r) => r.isDuplicate).length,
      totalAmountAdded,
      status: 'terminee',
    }
    const created = await importSessionRepository.create(session)
    await importedTransactionRepository.bulkCreate(
      importedRows.map((row) => ({ ...row, sessionId: created.id })),
    )

    await data.refresh()
    notify(addedCount > 0 ? `${addedCount} dépense${addedCount > 1 ? 's' : ''} importée${addedCount > 1 ? 's' : ''}` : 'Import terminé, aucune dépense ajoutée')
    close()
  }

  return (
    <Sheet
      open={open}
      title="Importer une image"
      onClose={close}
      tall={step === 'review'}
      action={
        step === 'review'
          ? { label: `Importer (${selectedCount})`, onClick: () => void commit(), disabled: selectedCount === 0 }
          : undefined
      }
    >
      {step === 'pick' ? (
        <div className="import-flow__picker">
          <span className="import-flow__picker-icon">
            <Icon name="upload" size={26} />
          </span>
          <div>
            <p>Choisissez une capture ou une photo de relevé bancaire.</p>
            <p className="import-flow__hint">
              La lecture se fait entièrement sur cet appareil, hors ligne. Aucune image n’est
              envoyée où que ce soit et rien n’est enregistré tant que vous n’avez pas validé
              chaque opération.
            </p>
          </div>
          <Button
            icon={<Icon name="upload" size={17} />}
            onClick={() => fileInputRef.current?.click()}
          >
            Choisir une image
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void onFileChosen(file)
            }}
          />
        </div>
      ) : null}

      {step === 'processing' ? (
        <div className="import-flow__progress">
          <div className="import-flow__progress-ring" style={{ '--pct': Math.round(progress * 100) } as React.CSSProperties}>
            <span className="import-flow__progress-inner">{Math.round(progress * 100)}%</span>
          </div>
          <p className="import-flow__progress-label">
            {phase === 'preparing' ? 'Préparation de l’image…' : 'Lecture du texte en cours…'}
          </p>
          <Button
            variant="soft"
            onClick={() => {
              ocrHandleRef.current?.cancel()
              reset()
            }}
          >
            Annuler
          </Button>
        </div>
      ) : null}

      {step === 'review' || step === 'saving' ? (
        <div className="stack">
          <div className="review-summary">
            <SectionHeader
              title={`${rows.length} opération${rows.length > 1 ? 's' : ''} détectée${rows.length > 1 ? 's' : ''}`}
              subtitle={`${selectedCount} sélectionnée${selectedCount > 1 ? 's' : ''} pour import`}
            />
            <div className="review-summary__actions">
              <Button variant="soft" onClick={selectAll} disabled={selectableRows.length === 0}>
                Tout sélectionner
              </Button>
              <Button variant="ghost" onClick={selectNone}>
                Tout ignorer
              </Button>
            </div>
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState icon={<Icon name="upload" size={26} />} title="Rien à importer" message="" />
            </Card>
          ) : (
            <ul className="review-list">
              {rows.map((row) => (
                <ReviewRowCard
                  key={row.tempId}
                  row={row}
                  onChange={(patch) => updateRow(row.tempId, patch)}
                />
              ))}
            </ul>
          )}

          <div className="import-flow__footer">
            <Button block onClick={() => void commit()} disabled={selectedCount === 0 || step === 'saving'}>
              {step === 'saving' ? 'Import en cours…' : `Importer ${selectedCount} dépense${selectedCount > 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  )
}

function toImportedTransaction(
  row: ReviewRow,
  sessionId: string,
  status: ImportedTransaction['status'],
  createdExpenseId: string | null,
): ImportedTransaction {
  return {
    id: row.tempId,
    sessionId,
    rawLine: row.rawLine,
    date: row.date,
    label: row.label,
    amount: row.amount,
    kind: row.kind,
    categoryId: row.categoryId,
    merchantId: row.merchantId,
    suggestedMerchantName: row.suggestedMerchantName,
    confidence: {
      date: row.date ? 'haute' : 'faible',
      amount: row.amount ? 'haute' : 'faible',
      merchant: row.merchantConfidence,
      category: row.categoryConfidence,
    },
    status,
    fingerprint: row.fingerprint,
    duplicateOfExpenseId: null,
    createdExpenseId,
  }
}

function ReviewRowCard({ row, onChange }: { row: ReviewRow; onChange: (patch: Partial<ReviewRow>) => void }) {
  const data = useData()
  const categoryName = row.categoryId ? data.categoryName(row.categoryId) : undefined
  const merchantName = row.merchantId ? data.merchantName(row.merchantId) : row.suggestedMerchantName

  const toggleDecision = () => {
    haptic('light')
    onChange({ decision: row.decision === 'valider' ? 'ignorer' : 'valider' })
  }

  return (
    <li
      className={`review-row ${row.isDuplicate ? 'review-row--duplicate' : ''} ${row.decision === 'ignorer' ? 'review-row--ignored' : ''}`}
    >
      <div className="review-row__head">
        <div>
          <div className="review-row__label">{row.label}</div>
          <div className="review-row__raw">{row.rawLine}</div>
          <div className="review-row__badges">
            {row.isDuplicate ? <TagChip label="Doublon probable" tone="warning" /> : null}
            {row.kind === 'inconnu' ? <TagChip label="Type à préciser" tone="warning" /> : null}
            {row.kind === 'depense' ? <TagChip label="Dépense" tone="negative" /> : null}
            {row.kind === 'revenu' ? <TagChip label="Revenu" tone="positive" /> : null}
            {!row.categoryId ? <TagChip label="Catégorie à choisir" tone="neutral" /> : null}
          </div>
        </div>
        <span className="tnum" style={{ fontWeight: 700 }}>
          {row.amount !== null ? money(row.amount) : '—'}
        </span>
      </div>

      <div className="review-row__meta">
        <span>{row.date ?? 'Date inconnue'}</span>
        <span>·</span>
        <span>{categoryName ?? 'Sans catégorie'}</span>
        {merchantName ? (
          <>
            <span>·</span>
            <span>{merchantName}</span>
          </>
        ) : null}
      </div>

      <div className="review-row__actions">
        <Button variant="soft" onClick={() => onChange({ editing: !row.editing })}>
          {row.editing ? 'Fermer' : 'Modifier'}
        </Button>
        <Button
          variant={row.decision === 'valider' ? 'danger' : 'primary'}
          onClick={toggleDecision}
          disabled={row.decision === 'ignorer' && !canValidateRow(row)}
        >
          {row.decision === 'valider' ? 'Ignorer' : 'Valider'}
        </Button>
      </div>

      {row.editing ? (
        <div className="review-row__form">
          <AmountInput label="Montant" value={row.amount ?? 0} onChange={(value) => onChange({ amount: value })} />
          <DateField label="Date" value={row.date ?? ''} onChange={(value) => onChange({ date: value })} />

          {row.kind === 'inconnu' ? (
            <div className="field">
              <span className="field__label">Type d’opération</span>
              <div className="review-row__form-grid">
                <Button variant="soft" onClick={() => onChange({ kind: 'depense' })}>
                  Dépense
                </Button>
                <Button variant="soft" onClick={() => onChange({ kind: 'revenu' })}>
                  Revenu
                </Button>
              </div>
            </div>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor={`cat-${row.tempId}`}>
              Catégorie
            </label>
            <select
              id={`cat-${row.tempId}`}
              className="field__input"
              value={row.categoryId ?? ''}
              onChange={(event) => onChange({ categoryId: event.target.value || null })}
            >
              <option value="">Sans catégorie</option>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={`mer-${row.tempId}`}>
              Enseigne
            </label>
            <select
              id={`mer-${row.tempId}`}
              className="field__input"
              value={row.merchantId ?? ''}
              onChange={(event) =>
                onChange({ merchantId: event.target.value || null, suggestedMerchantName: null })
              }
            >
              <option value="">
                {row.suggestedMerchantName ? `Nouvelle : ${row.suggestedMerchantName}` : 'Aucune'}
              </option>
              {data.merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          </div>

          <label className="review-row__memorize">
            <input
              type="checkbox"
              checked={row.memorize}
              onChange={(event) => onChange({ memorize: event.target.checked })}
            />
            Mémoriser ce choix pour les libellés similaires
          </label>
        </div>
      ) : null}
    </li>
  )
}
