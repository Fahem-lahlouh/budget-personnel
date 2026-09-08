import { useRef, type TouchEvent } from 'react'

/**
 * Balayage horizontal pour changer de mois.
 *
 * Les seuils sont volontairement stricts : un geste n'est retenu que s'il est
 * franchement horizontal (deux fois plus large que haut) et assez long. Sans
 * ça, un défilement vertical un peu oblique ferait sauter de mois, ce qui est
 * bien plus agaçant qu'un balayage ignoré.
 */
export function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY }
    },
    onTouchEnd: (event: TouchEvent) => {
      if (!start.current) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.current.x
      const dy = touch.clientY - start.current.y
      start.current = null

      if (Math.abs(dx) < 64) return
      if (Math.abs(dx) < Math.abs(dy) * 2) return
      onSwipe(dx < 0 ? 1 : -1)
    },
  }
}
