/**
 * Prétraitement d'image avant OCR : redimensionnement et passage en niveaux
 * de gris avec un léger renforcement de contraste. Sur iPhone, une photo de
 * relevé bancaire peut peser plusieurs dizaines de mégapixels — la traiter
 * telle quelle ferait exploser la mémoire de Safari en PWA (le moteur WASM de
 * Tesseract tourne dans le même processus). On la ramène à une largeur
 * raisonnable avant de la confier au worker OCR.
 */

const MAX_DIMENSION = 1600

/** Échec de décodage : format d'image que le navigateur ne sait pas lire. */
export class ImageDecodeError extends Error {
  constructor() {
    super('Image illisible')
    this.name = 'ImageDecodeError'
  }
}

interface DecodedImage {
  readonly width: number
  readonly height: number
  readonly source: CanvasImageSource
  release: () => void
}

/**
 * `createImageBitmap` est le chemin rapide, mais Safari lui refuse certains
 * formats — dont le HEIC natif de l'appareil photo iPhone, qu'iOS ne convertit
 * en JPEG que lorsque la photo passe par la photothèque. On retombe alors sur
 * un `<img>`, que Safari sait décoder pour tous les formats qu'il affiche.
 *
 * `imageOrientation: 'from-image'` est essentiel : sans lui, une photo prise en
 * portrait arrive couchée et l'OCR ne reconnaît plus une seule ligne. Le
 * `<img>` de repli applique l'orientation EXIF de lui-même.
 */
async function decodeImage(file: File | Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      release: () => bitmap.close(),
    }
  } catch {
    return decodeViaImageElement(file)
  }
}

function decodeViaImageElement(file: File | Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image,
        release: () => URL.revokeObjectURL(url),
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ImageDecodeError())
    }
    image.src = url
  })
}

export async function preprocessImageForOcr(file: File | Blob): Promise<Blob> {
  const decoded = await decodeImage(file)
  if (decoded.width === 0 || decoded.height === 0) {
    decoded.release()
    throw new ImageDecodeError()
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height))
    const width = Math.round(decoded.width * scale)
    const height = Math.round(decoded.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Contexte de dessin indisponible')

    ctx.drawImage(decoded.source, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    grayscaleWithContrast(imageData.data)
    ctx.putImageData(imageData, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Échec de conversion de l’image')
    return blob
  } finally {
    decoded.release()
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
