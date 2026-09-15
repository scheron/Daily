let highlightTimeout: ReturnType<typeof setTimeout> | null = null

export function highlightElement(elementId: string) {
  if (highlightTimeout) clearTimeout(highlightTimeout)

  const element = document.getElementById(elementId)

  if (!element) {
    console.warn(`Element with id "${elementId}" not found for highlighting`)
    return
  }

  element.classList.add("highlight")

  highlightTimeout = setTimeout(() => {
    element.classList.remove("highlight")
  }, 2000)
}
