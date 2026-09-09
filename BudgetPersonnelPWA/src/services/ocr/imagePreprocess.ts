/**
 * Prétraitement d'image avant OCR : redimensionnement et passage en niveaux
 * de gris avec un léger renforcement de contraste. Sur iPhone, une photo de
 * relevé bancaire peut peser plusieurs dizaines de mégapixels — la traiter
 * telle quelle ferait exploser la mémoire de Safari en PWA (le moteur WASM de
 * Tesseract tourne dans le même processus). On la ramène à une largeur
 * raisonnable avant de la confier au worker OCR.
 */

const MAX_DIMENSION = 1600

export async function preprocessImageForOcr(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Contexte de dessin indisponible')

    ctx.drawImage(bitmap, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    grayscaleWithContrast(imageData.data)
    ctx.putImageData(imageData, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Échec de conversion de l’image')
    return blob
  } finally {
    bitmap.close()
  }
}

/** Niveaux de gris pondérés + étirement de contraste simple, en place. */
function grayscaleWithContrast(data: Uint8ClampedArray): void {
  const contrast = 1.15
  const midpoint = 128

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    const adjusted = clamp((gray - midpoint) * contrast + midpoint)
    data[i] = adjusted
    data[i + 1] = adjusted
    data[i + 2] = adjusted
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value))
}
