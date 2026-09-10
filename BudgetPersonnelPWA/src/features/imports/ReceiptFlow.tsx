import { useCallback, useMemo, useRef, useState } from 'react'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { Sheet } from '@/components/Sheet'
import { Card, SectionHeader, TagChip } from '@/components/Card'
import { Button } from '@/components/Button'
import { AmountInput, DateField, TextField } from '@/components/Field'
import { Icon } from '@/design-system/Icon'
import { haptic } from '@/utils/haptics'
import {
  expenseRepository,
  merchantRepository,
  receiptRepository,
  merchantAliasRepository,
  categorizationRuleRepository,
} from '@/repositories'
import { preprocessImageForOcr, ImageDecodeError } from '@/services/ocr/imagePreprocess'
import { runOcr, OcrCancelledError, type OcrRunHandle } from '@/services/ocr/tesseractClient'
import { parseReceipt } from '@/services/ocr/receiptParser'
import { normalizeMerchantLabel } from '@/services/ocr/merchantNormalizer'
import { computeFingerprint } from '@/services/ocr/fingerprint'
import { buildExistingFingerprints, isDuplicateFingerprint } from '@/services/ocr/duplicateDetector'
import { proposeCategorization } from '@/services/ocr/categorizationEngine'
import { money } from '@/services/format'
import { itemsTotal } from '@/models/receipt'
import { todayISO, type ExpenseType } from '@/models/types'
import './ImportFlow.css'

interface ReceiptFlowProps {
  open: boolean
  onClose: () => void
}

type Step = 'pick' | 'processing' | 'review' | 'saving' | 'error'

interface DraftItem {
  tempId: string
  label: string
  quantity: number | null
  unitPrice: number | null
  totalPrice: number
}

function newTempId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `t-${Math.random()}`
}

/**
 * Photographier un ticket de caisse et en tirer une dépense détaillée.
 *
 * Tout se passe sur l'appareil : la photo est lue par le moteur OCR local,
 * jamais envoyée nulle part. Rien n'est enregistré tant que l'écran de
 * vérification n'a pas été validé, et chaque valeur extraite y reste
 * modifiable — l'OCR propose, l'utilisateur tranche.
 */
export function ReceiptFlow({ open, onClose }: ReceiptFlowProps) {
  const data = useData()
  const { notify } = useToast()

  const [step, setStep] = useState<Step>('pick')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'preparing' | 'reading'>('preparing')
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null)

  const [merchantName, setMerchantName] = useState('')
  const [merchantId, setMerchantId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<DraftItem[]>([])
  const [rawText, setRawText] = useState('')
  const [confidential, setConfidential] = useState(false)
  const [memorize, setMemorize] = useState(true)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)

  const ocrHandleRef = useRef<OcrRunHandle | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const libraryInputRef = useRef<HTMLInputElement>(null)

  const keepImages = data.settings?.keepReceiptImages ?? true

  const reset = useCallback(() => {
    setStep('pick')
    setProgress(0)
    setPhase('preparing')
    setFailure(null)
    setMerchantName('')
    setMerchantId(null)
    setCategoryId(null)
    setDate(todayISO())
    setTotal(0)
    setItems([])
    setRawText('')
    setConfidential(false)
    setMemorize(true)
    setIsDuplicate(false)
    setPhoto(null)
    ocrHandleRef.current = null
  }, [])

  const fail = useCallback((title: string, message: string) => {
    setFailure({ title, message })
    setStep('error')
    ocrHandleRef.current = null
  }, [])

  const close = () => {
    ocrHandleRef.current?.cancel()
    reset()
    onClose()
  }

  const onFileChosen = async (file: File) => {
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

      const parsed = parseReceipt(text, data.year)
      const draftItems: DraftItem[] = parsed.items.map((item) => ({
        tempId: newTempId(),
        label: item.label,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }))

      if (!parsed.merchantName && parsed.total === null && draftItems.length === 0) {
        fail(
          'Ticket illisible',
          text.trim().length === 0
            ? 'Aucun texte n’a pu être lu. Photographiez le ticket à plat, bien éclairé, en cadrant du nom du magasin jusqu’au total.'
            : 'Du texte a été lu, mais ni enseigne, ni total, ni article n’y ont été reconnus. Rapprochez-vous du ticket et évitez les plis et les reflets.',
        )
        return
      }

      // Le total du ticket fait foi ; à défaut, la somme des lignes lues.
      const amount = parsed.total ?? itemsTotal(parsed.items)
      const purchaseDate = parsed.purchasedAt ?? todayISO()

      const proposal = proposeCategorization(parsed.merchantName ?? '', {
        rules: await categorizationRuleRepository.all(),
        aliases: await merchantAliasRepository.all(),
        merchants: data.merchants,
        expenses: data.expenses,
      })

      const existing = buildExistingFingerprints(data.expenses, data.merchantName)
      const fingerprint = computeFingerprint(purchaseDate, amount, parsed.merchantName ?? '')

      setMerchantName(parsed.merchantName ?? '')
      setMerchantId(proposal.merchantId)
      setCategoryId(proposal.categoryId)
      setDate(purchaseDate)
      setTotal(amount)
      setItems(draftItems)
      setRawText(text)
      setIsDuplicate(isDuplicateFingerprint(fingerprint, existing))
      setPhoto(keepImages ? processed : null)
      setStep('review')
    } catch (error) {
      if (error instanceof OcrCancelledError) {
        reset()
        return
      }
      if (error instanceof ImageDecodeError) {
        fail(
          'Photo illisible',
          'Ce fichier n’a pas pu être ouvert comme une image. Reprenez la photo, ou choisissez-la dans la photothèque.',
        )
        return
      }
      fail(
        'La lecture a échoué',
        `Le moteur de lecture s’est interrompu : ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const linesTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.totalPrice, 0),
    [items],
  )
  const mismatch = items.length > 0 && Math.abs(linesTotal - total) >= 0.01
  const canSave = total > 0 && categoryId !== null && (merchantId !== null || merchantName.trim() !== '')

  const updateItem = (tempId: string, patch: Partial<DraftItem>) => {
    setItems((current) =>
      current.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)),
    )
  }

  const save = async () => {
    if (!canSave) return
    setStep('saving')

    try {
      let resolvedMerchantId = merchantId
      if (!resolvedMerchantId && merchantName.trim()) {
        resolvedMerchantId = (await merchantRepository.create(merchantName.trim())).id
      }

      const expense = await expenseRepository.create({
        date,
        categoryId: categoryId!,
        merchantId: resolvedMerchantId ?? '',
        description: merchantName.trim(),
        amount: total,
        type: 'variable' as ExpenseType,
        plannedAmount: null,
        status: 'paye',
        note: '',
        confidential,
        recurringId: null,
      })

      await receiptRepository.create({
        expenseId: expense.id,
        merchantName: merchantName.trim(),
        purchasedAt: date,
        total,
        items: items.map(({ label, quantity, unitPrice, totalPrice }) => ({
          label,
          quantity,
          unitPrice,
          totalPrice,
        })),
        rawText,
        image: photo,
      })

      if (memorize && merchantName.trim()) {
        const normalized = normalizeMerchantLabel(merchantName)
        if (resolvedMerchantId) await merchantAliasRepository.learn(normalized, resolvedMerchantId)
        if (categoryId) {
          await categorizationRuleRepository.learn(normalized, categoryId, resolvedMerchantId)
        }
      }

      await data.refresh()
      notify(`Ticket enregistré — ${money(total)}`)
      close()
    } catch (error) {
      fail(
        'Enregistrement impossible',
        error instanceof Error ? error.message : 'Une erreur inattendue est survenue.',
      )
    }
  }

  return (
    <Sheet
      open={open}
      title="Ticket de caisse"
      onClose={close}
      tall={step === 'review' || step === 'saving'}
      action={
        step === 'review'
          ? { label: 'Enregistrer', onClick: () => void save(), disabled: !canSave }
          : undefined
      }
    >
      {step === 'pick' ? (
        <div className="import-flow__picker">
          <span className="import-flow__picker-icon">
            <Icon name="store" size={26} />
          </span>
          <div>
            <p>Photographiez votre ticket de caisse.</p>
            <p className="import-flow__hint">
              La lecture se fait entièrement sur cet appareil, hors ligne. Ni la photo ni son texte
              ne sont envoyés où que ce soit, et rien n’est enregistré tant que vous n’avez pas
              vérifié le résultat.
            </p>
          </div>
          <Button
            icon={<Icon name="plus" size={17} />}
            onClick={() => cameraInputRef.current?.click()}
          >
            Prendre une photo
          </Button>
          <Button variant="soft" onClick={() => libraryInputRef.current?.click()}>
            Choisir dans la photothèque
          </Button>
          {!keepImages ? (
            <p className="import-flow__hint">
              La photo sera lue puis jetée : vous avez désactivé leur conservation dans les
              réglages.
            </p>
          ) : null}

          {/* `capture` ouvre directement l'appareil photo arrière sur iPhone ;
              sans lui, iOS propose d'abord un menu. Le second champ, sans
              `capture`, laisse l'accès à la photothèque. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void onFileChosen(file)
            }}
          />
          <input
            ref={libraryInputRef}
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

      {step === 'error' && failure ? (
        <div className="import-flow__picker">
          <span className="import-flow__picker-icon import-flow__picker-icon--warning">
            <Icon name="alert" size={26} />
          </span>
          <div>
            <p>{failure.title}</p>
            <p className="import-flow__hint">{failure.message}</p>
          </div>
          <Button icon={<Icon name="refresh" size={17} />} onClick={() => reset()}>
            Reprendre une photo
          </Button>
        </div>
      ) : null}

      {step === 'processing' ? (
        <div className="import-flow__progress">
          <div
            className="import-flow__progress-ring"
            style={{ '--pct': Math.round(progress * 100) } as React.CSSProperties}
          >
            <span className="import-flow__progress-inner">{Math.round(progress * 100)}%</span>
          </div>
          <p className="import-flow__progress-label">
            {phase === 'preparing' ? 'Préparation de la photo…' : 'Lecture du ticket en cours…'}
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
          {isDuplicate ? (
            <Card>
              <div className="review-row__badges">
                <TagChip label="Doublon probable" tone="warning" />
              </div>
              <p className="import-flow__hint">
                Une dépense de ce montant existe déjà pour cette enseigne à cette date. Vérifiez
                avant d’enregistrer.
              </p>
            </Card>
          ) : null}

          <Card>
            <SectionHeader title="Dépense" />
            <TextField label="Enseigne" value={merchantName} onChange={setMerchantName} />
            <AmountInput label="Montant total" value={total} onChange={setTotal} />
            <DateField label="Date" value={date} onChange={setDate} />

            <div className="field">
              <label className="field__label" htmlFor="receipt-category">
                Catégorie
              </label>
              <select
                id="receipt-category"
                className="field__input"
                value={categoryId ?? ''}
                onChange={(event) => setCategoryId(event.target.value || null)}
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
              <label className="field__label" htmlFor="receipt-merchant">
                Enseigne enregistrée
              </label>
              <select
                id="receipt-merchant"
                className="field__input"
                value={merchantId ?? ''}
                onChange={(event) => setMerchantId(event.target.value || null)}
              >
                <option value="">
                  {merchantName.trim() ? `Nouvelle : ${merchantName.trim()}` : 'Aucune'}
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
                checked={confidential}
                onChange={(event) => setConfidential(event.target.checked)}
              />
              Dépense confidentielle (masque aussi le ticket et ses articles)
            </label>
            <label className="review-row__memorize">
              <input
                type="checkbox"
                checked={memorize}
                onChange={(event) => setMemorize(event.target.checked)}
              />
              Mémoriser cette enseigne et sa catégorie
            </label>
          </Card>

          <Card>
            <SectionHeader
              title={`${items.length} article${items.length > 1 ? 's' : ''}`}
              subtitle={
                mismatch
                  ? `La somme des lignes fait ${money(linesTotal)}, le total ${money(total)}`
                  : undefined
              }
              trailing={
                <Button
                  variant="ghost"
                  onClick={() => {
                    haptic('light')
                    setItems((current) => [
                      ...current,
                      { tempId: newTempId(), label: '', quantity: null, unitPrice: null, totalPrice: 0 },
                    ])
                  }}
                >
                  Ajouter
                </Button>
              }
            />

            {items.length === 0 ? (
              <p className="import-flow__hint">
                Aucun article n’a été reconnu. La dépense sera enregistrée sans détail — vous
                pouvez en ajouter à la main.
              </p>
            ) : (
              <ul className="receipt-items">
                {items.map((item) => (
                  <li key={item.tempId} className="receipt-items__edit">
                    <TextField
                      label="Article"
                      value={item.label}
                      onChange={(value) => updateItem(item.tempId, { label: value })}
                    />
                    <div className="review-row__form-grid">
                      <AmountInput
                        label="Prix"
                        value={item.totalPrice}
                        onChange={(value) => updateItem(item.tempId, { totalPrice: value })}
                      />
                      <div className="field">
                        <label className="field__label" htmlFor={`qty-${item.tempId}`}>
                          Quantité
                        </label>
                        <input
                          id={`qty-${item.tempId}`}
                          className="field__input tnum"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={item.quantity ?? ''}
                          onChange={(event) =>
                            updateItem(item.tempId, {
                              quantity: event.target.value === '' ? null : Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setItems((current) => current.filter((row) => row.tempId !== item.tempId))
                      }
                    >
                      Retirer
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="import-flow__footer">
            <Button block onClick={() => void save()} disabled={!canSave || step === 'saving'}>
              {step === 'saving' ? 'Enregistrement…' : `Enregistrer ${money(total)}`}
            </Button>
            {!canSave ? (
              <p className="import-flow__hint">
                Une catégorie et un montant supérieur à zéro sont nécessaires pour enregistrer.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Sheet>
  )
}
