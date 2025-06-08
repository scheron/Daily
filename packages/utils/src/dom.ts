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
