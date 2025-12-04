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

let highlightTimeout: NodeJS.Timeout | null = null

export function highlightElement(elementId: string, options: {class: string; duration?: number}) {
  if (highlightTimeout) clearTimeout(highlightTimeout)

  const {class: className, duration = 2000} = options

  const element = document.getElementById(elementId)

  if (!element) {
    console.warn(`Element with id "${elementId}" not found for highlighting`)
    return false
  }

  if (className) element.classList.add(className)

  highlightTimeout = setTimeout(() => {
    if (className) element.classList.remove(className)
  }, duration)

  return true
}

export async function scrollToElement(
  elementId: string,
  options: {
    behavior?: ScrollBehavior
    block?: ScrollLogicalPosition
    timeout?: number
  } = {},
): Promise<boolean> {
  const {behavior = "smooth", block = "center", timeout = 3000} = options

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

        if (performance.now() - startTime < timeout) {
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

  element.scrollIntoView({behavior, block})
  return true
}
