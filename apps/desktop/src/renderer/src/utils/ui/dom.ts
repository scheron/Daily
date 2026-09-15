const focusableSelectors = [
  "a[href]",
  "area[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  '[tabindex]:not([tabindex="-1"])',
]

export function findFocusableEl(el: HTMLElement): HTMLElement | null {
  if (el.tabIndex >= 0 || el.contentEditable === "true") {
    return el
  }

  return el.querySelector(focusableSelectors.join(", ")) as HTMLElement | null
}

export function findAllFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(focusableSelectors.join(", "))) as HTMLElement[]
}

export function findClosestAtPoint(x: number, y: number, selector: string): HTMLElement | null {
  const el = document.elementFromPoint(x, y)
  return el?.closest<HTMLElement>(selector) ?? null
}

export async function scrollToElement(elementId: string): Promise<boolean> {
  let element = document.getElementById(elementId)
  let rafId: number | null = null

  if (!element) {
    const startTime = performance.now()

    element = await new Promise<HTMLElement | null>((resolve) => {
      function checkElement() {
        const el = document.getElementById(elementId)
        if (el) {
          if (rafId) cancelAnimationFrame(rafId)
          rafId = null

          resolve(el)
          return
        }

        if (performance.now() - startTime < 3000) {
          rafId = requestAnimationFrame(checkElement)
        } else {
          resolve(null)
        }
      }

      rafId = requestAnimationFrame(checkElement)
    })
  }

  if (!element) {
    console.warn(`Element with id "${elementId}" not found`)
    return false
  }

  element.scrollIntoView({behavior: "smooth", block: "center"})
  return true
}

export function getCssVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
