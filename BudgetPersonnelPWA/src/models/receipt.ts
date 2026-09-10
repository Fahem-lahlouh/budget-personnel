/**
 * Ticket de caisse rattaché à une dépense.
 *
 * Un ticket ne remplace jamais la dépense : il la documente. La dépense reste
 * la source de vérité du budget (c'est son `amount` qui compte partout), le
 * ticket n'ajoute que le détail de ce qui a été acheté. Une dépense sans
 * ticket reste parfaitement valide — c'est le cas de toutes celles saisies
 * avant l'arrivée de cette fonctionnalité.
 */

export interface ReceiptItem {
  id: string
  label: string
  /** Quantité lue sur le ticket, `null` quand il n'en indique pas. */
  quantity: number | null
  /** Prix unitaire, `null` quand le ticket ne donne que le total de la ligne. */
  unitPrice: number | null
  /** Total de la ligne, toujours renseigné : c'est ce que coûte l'article. */
  totalPrice: number
}

export interface Receipt {
  id: string
  /** Dépense documentée par ce ticket. Un ticket n'existe jamais seul. */
  expenseId: string
  /** Enseigne telle que lue sur le ticket, avant normalisation. */
  merchantName: string
  /** Date d'achat au format `YYYY-MM-DD`, `null` si le ticket n'en porte pas. */
  purchasedAt: string | null
  /** Total lu sur le ticket — peut différer du montant de la dépense si l'utilisateur l'a corrigé. */
  total: number
  items: ReceiptItem[]
  /**
   * Texte OCR brut. Conservé parce qu'aucun parseur ne lit tout : il permet de
   * retrouver à l'œil une ligne que l'extraction a manquée, sans reprendre la
   * photo — et il ne quitte jamais l'appareil.
   */
  rawText: string
  /**
   * Libellés d'articles en minuscules, concaténés. Dupliqué ici pour que la
   * recherche « coca » retrouve la dépense sans avoir à parcourir les articles
   * de tous les tickets à chaque frappe.
   */
  searchIndex: string
  /** Une photo est conservée dans `receiptImages` pour ce ticket. */
  hasImage: boolean
  createdAt: string
}

/**
 * Photo du ticket, dans sa propre table.
 *
 * Séparée des tickets pour que lister les dépenses ne traîne pas des mégaoctets
 * d'images derrière elle : la photo n'est lue que lorsqu'on ouvre le détail.
 */
export interface ReceiptImage {
  /** Identique à `receiptId` : un ticket n'a qu'une photo. */
  id: string
  receiptId: string
  blob: Blob
  mimeType: string
  byteSize: number
}

/** Construit l'index de recherche d'un ticket à partir de ses articles. */
export function buildSearchIndex(merchantName: string, items: ReceiptItem[]): string {
  return [merchantName, ...items.map((item) => item.label)].join(' ').toLocaleLowerCase('fr')
}

/** Somme des lignes, pour signaler un écart avec le total lu sur le ticket. */
export function itemsTotal(items: readonly { totalPrice: number }[]): number {
  return items.reduce((sum, item) => sum + item.totalPrice, 0)
}
