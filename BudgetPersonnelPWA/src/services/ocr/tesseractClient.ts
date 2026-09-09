import { createWorker } from 'tesseract.js'

/**
 * OCR strictement local : le worker, le moteur WASM et le modèle de langue
 * française sont servis depuis l'origine de l'app (`/tesseract`, `/tessdata`)
 * — jamais un CDN. C'est aussi ce qu'exige la CSP `connect-src 'self'` de
 * `index.html`. Aucune image ni aucun texte ne quitte l'appareil : Tesseract
 * ne fait que lire les octets qu'on lui donne, il n'ouvre lui-même aucune
 * connexion réseau propre en dehors de ces trois fichiers auto-hébergés.
 */

const base = import.meta.env.BASE_URL

export interface OcrRunHandle {
  /** Résout avec le texte reconnu une fois l'OCR terminé. */
  result: Promise<string>
  /** Interrompt l'OCR en cours ; `result` ne se résout alors jamais. */
  cancel: () => void
}

export function runOcr(image: Blob, onProgress: (ratio: number) => void): OcrRunHandle {
  let cancelled = false
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null

  const result = (async () => {
    worker = await createWorker('fra', 1, {
      workerPath: `${base}tesseract/worker.min.js`,
      corePath: `${base}tesseract/tesseract-core-simd-lstm.wasm.js`,
      langPath: `${base}tessdata`,
      cacheMethod: 'none',
      // Instancie le worker directement depuis son URL d'origine plutôt que via
      // un blob : évite d'avoir à autoriser `blob:` dans la CSP `worker-src`.
      workerBlobURL: false,
      logger: (message) => {
        if (message.status === 'recognizing text' && typeof message.progress === 'number') {
          onProgress(message.progress)
        }
      },
    })

    if (cancelled) {
      await worker.terminate()
      throw new OcrCancelledError()
    }

    const { data } = await worker.recognize(image)
    await worker.terminate()
    worker = null

    if (cancelled) throw new OcrCancelledError()
    return data.text
  })()

  return {
    result,
    cancel: () => {
      cancelled = true
      void worker?.terminate()
    },
  }
}

export class OcrCancelledError extends Error {
  constructor() {
    super('OCR annulé')
    this.name = 'OcrCancelledError'
  }
}
