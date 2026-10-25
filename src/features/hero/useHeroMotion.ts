import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'

export function useReducedMotion() {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(REDUCED)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

/** True while the tab is visible; used to pause the Earth's render loop in background tabs. */
export function useTabVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const change = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  return visible
}

/** Gentle pointer parallax (fine pointers only). Transform-only; the loop stops as soon as it settles. Not scroll-related. */
export function useHeroParallax(stage: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const node = stage.current
    if (!node || !enabled || !window.matchMedia('(pointer: fine)').matches) return
    let tx = 0, ty = 0, cx = 0, cy = 0, frame = 0
    const tick = () => {
      cx += (tx - cx) * 0.08
      cy += (ty - cy) * 0.08
      node.style.setProperty('--ws-mx', cx.toFixed(3))
      node.style.setProperty('--ws-my', cy.toFixed(3))
      frame = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0
    }
    const move = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      tx = ((event.clientX - rect.left) / rect.width - 0.5) * 2
      ty = ((event.clientY - rect.top) / rect.height - 0.5) * 2
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const leave = () => { tx = 0; ty = 0; if (!frame) frame = requestAnimationFrame(tick) }
    node.addEventListener('pointermove', move, { passive: true })
    node.addEventListener('pointerleave', leave)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerleave', leave)
    }
  }, [stage, enabled])
}
