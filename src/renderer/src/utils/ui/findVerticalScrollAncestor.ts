/**
 * Walks up from a DOM target to the nearest ancestor that scrolls vertically
 * (overflow-y auto/scroll/overlay and actually overflowing), or null if none.
 */
export function findVerticalScrollAncestor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null

  let current: HTMLElement | null = target
  while (current) {
    const style = window.getComputedStyle(current)
    const isScrollableY = /(auto|scroll|overlay)/.test(style.overflowY)
    if (isScrollableY && current.scrollHeight > current.clientHeight) {
      return current
    }
    current = current.parentElement
  }

  return null
}
