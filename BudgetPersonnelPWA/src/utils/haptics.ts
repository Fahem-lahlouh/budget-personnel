/**
 * Retour tactile.
 *
 * `navigator.vibrate` n'existe pas sur iOS : Safari ne l'expose pas, et il
 * n'existe aucune API Web équivalente au retour haptique natif. L'appel est
 * donc silencieusement ignoré sur iPhone, et sert sur Android et les
 * navigateurs de bureau qui le supportent. Aucune fonctionnalité n'en dépend.
 */

type Pattern = 'light' | 'success' | 'warning' | 'error'

const PATTERNS: Record<Pattern, number | number[]> = {
  light: 8,
  success: [10, 40, 16],
  warning: [16, 60, 16],
  error: [24, 50, 24, 50, 24],
}

export function haptic(pattern: Pattern = 'light'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  try {
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Certains navigateurs refusent l'appel hors interaction utilisateur.
  }
}
