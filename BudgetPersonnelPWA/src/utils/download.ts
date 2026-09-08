/**
 * Déclenche le téléchargement d'un fichier généré localement.
 *
 * Aucune requête réseau : le contenu vient d'un `Blob` en mémoire, et l'URL
 * objet est révoquée juste après pour ne pas garder les données en vie.
 *
 * Sur iOS, un téléchargement depuis une PWA en mode plein écran ouvre la
 * feuille de partage plutôt qu'un dossier « Téléchargements » : c'est le
 * comportement attendu du système, et l'utilisateur choisit où ranger le
 * fichier (Fichiers, Mail, AirDrop…).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Laisse à Safari le temps de démarrer le transfert avant de libérer l'URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Lit un fichier choisi par l'utilisateur et le décode en JSON. */
export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text()
  return JSON.parse(text) as unknown
}
