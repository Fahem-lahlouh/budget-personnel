import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { IconButton } from '@/components/Button'
import { Icon } from '@/design-system/Icon'
import { useData } from '@/app/DataContext'
import { useToast } from '@/app/ToastContext'
import { categoryRepository, merchantRepository } from '@/repositories'
import type { Category, Merchant } from '@/models/types'
import './Settings.css'

/** Une catégorie ou une enseigne : seules les catégories portent une icône. */
type ListItem = Category | Merchant

function iconOf(item: ListItem): string {
  return 'icon' in item ? item.icon : 'store'
}

interface ListEditorSheetProps {
  open: boolean
  kind: 'categories' | 'merchants'
  onClose: () => void
}

/**
 * Gestion des catégories et des enseignes : ajout, renommage, réordonnancement,
 * suppression.
 *
 * Le renommage ne touche **aucune** dépense : les dépenses référencent un
 * identifiant, pas un libellé. C'est tout l'intérêt du modèle par ID, et ce qui
 * rend l'opération sûre même sur un historique de plusieurs années.
 */
export function ListEditorSheet({ open, kind, onClose }: ListEditorSheetProps) {
  const data = useData()
  const { notify } = useToast()

  const repository = kind === 'categories' ? categoryRepository : merchantRepository
  const items: ListItem[] = kind === 'categories' ? data.categories : data.merchants
  const noun = kind === 'categories' ? 'catégorie' : 'enseigne'

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; usage: number } | null>(null)

  useEffect(() => {
    if (!open) {
      setDraft('')
      setEditingId(null)
      setPendingDelete(null)
    }
  }, [open])

  const exists = (name: string, exceptId?: string) =>
    items.some(
      (item) =>
        item.id !== exceptId &&
        item.name.localeCompare(name, 'fr', { sensitivity: 'base' }) === 0,
    )

  const add = async () => {
    const name = draft.trim()
    if (!name) return
    if (exists(name)) {
      notify(`« ${name} » existe déjà`, 'error')
      return
    }
    await repository.create(name)
    setDraft('')
    await data.refresh()
  }

  const rename = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) return
    if (exists(name, editingId)) {
      notify(`« ${name} » existe déjà`, 'error')
      return
    }
    await repository.rename(editingId, name)
    setEditingId(null)
    await data.refresh()
    notify('Renommé — l’historique est conservé', 'success')
  }

  const askDelete = async (id: string) => {
    const usage = await repository.usageCount(id)
    setPendingDelete({ id, usage })
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    await repository.remove(pendingDelete.id)
    setPendingDelete(null)
    await data.refresh()
    notify(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} supprimée`)
  }

  const move = async (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= items.length) return
    const ordered = [...items]
    const [moved] = ordered.splice(index, 1)
    ordered.splice(next, 0, moved)
    await repository.reorder(ordered.map((item) => item.id))
    await data.refresh()
  }

  return (
    <Sheet
      open={open}
      tall
      title={kind === 'categories' ? 'Catégories' : 'Enseignes'}
      onClose={onClose}
    >
      <div className="stack" style={{ paddingTop: 10 }}>
        <div className="list-editor__add">
          <input
            className="field__input"
            type="text"
            placeholder={`Nouvelle ${noun}`}
            value={draft}
            enterKeyHint="done"
            aria-label={`Nouvelle ${noun}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add()
            }}
          />
          <IconButton label={`Ajouter la ${noun}`} onClick={() => void add()}>
            <Icon name="plus" size={19} />
          </IconButton>
        </div>

        <p className="settings__note">
          Renommer ne casse pas l’historique : les dépenses gardent leur lien, seul le libellé
          change.
        </p>

        <ul className="list-rows list-editor">
          {items.map((item, index) => (
            <li key={item.id} className="list-editor__row">
              {editingId === item.id ? (
                <>
                  <input
                    className="field__input"
                    value={editingName}
                    autoFocus
                    aria-label={`Nouveau nom de ${item.name}`}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void rename()
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                  />
                  <IconButton label="Valider le renommage" onClick={() => void rename()}>
                    <Icon name="check" size={17} />
                  </IconButton>
                </>
              ) : (
                <>
                  <span className="list-editor__icon" aria-hidden="true">
                    <Icon name={iconOf(item)} size={16} />
                  </span>

                  <button
                    type="button"
                    className="list-editor__name"
                    onClick={() => {
                      setEditingId(item.id)
                      setEditingName(item.name)
                    }}
                  >
                    {item.name}
                  </button>

                  <span className="list-editor__actions">
                    <IconButton
                      label={`Monter ${item.name}`}
                      tone="neutral"
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      <Icon name="chevronUp" size={15} />
                    </IconButton>
                    <IconButton
                      label={`Descendre ${item.name}`}
                      tone="neutral"
                      disabled={index === items.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      <Icon name="chevronDown" size={15} />
                    </IconButton>
                    <IconButton
                      label={`Supprimer ${item.name}`}
                      tone="neutral"
                      onClick={() => void askDelete(item.id)}
                    >
                      <Icon name="trash" size={15} />
                    </IconButton>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>

        <ConfirmDialog
          open={pendingDelete !== null}
          title={`Supprimer cette ${noun} ?`}
          message={
            pendingDelete && pendingDelete.usage > 0
              ? `${pendingDelete.usage} dépense${pendingDelete.usage > 1 ? 's l’utilisent' : ' l’utilise'}. Elle${pendingDelete.usage > 1 ? 's' : ''} rester${pendingDelete.usage > 1 ? 'ont' : 'a'} dans l’historique, mais sans ${noun}.`
              : undefined
          }
          warning="Cette action est irréversible."
          confirmLabel="Supprimer"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    </Sheet>
  )
}
