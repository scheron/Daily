import {WidgetType} from "@codemirror/view"

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

/**
 * Widget for rendering images in readonly mode
 * Supports custom dimensions via ![alt =WIDTHxHEIGHT](url) syntax
 *
 * Examples:
 * - ![My image](https://example.com/image.png)
 * - ![Logo =200x100](https://example.com/logo.png)
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly width?: number,
    readonly height?: number,
  ) {
    super()
  }

  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt && other.width === this.width && other.height === this.height
  }

  toDOM() {
    const wrapper = document.createElement("span")
    wrapper.className = "cm-image-wrapper"
    wrapper.style.display = "inline-block"
    wrapper.style.maxWidth = "100%"
    wrapper.style.margin = "0.5rem 0"

    const img = document.createElement("img")
    img.src = this.url
    img.alt = this.alt
    img.style.maxWidth = "100%"
    img.style.height = "auto"
    img.style.display = "block"
    img.style.borderRadius = "0.375rem" // rounded-md

    if (this.width) {
      img.style.width = `${this.width}px`
      img.style.maxWidth = "100%"
    }
    if (this.height) {
      img.style.height = this.width ? "auto" : `${this.height}px`
    }

    let retryCount = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    img.onerror = () => {
      if (retryCount < MAX_RETRIES) {
        retryCount++
        retryTimer = setTimeout(() => {
          img.src = `${this.url}${this.url.includes("?") ? "&" : "?"}retry=${retryCount}`
        }, RETRY_DELAY_MS)
      } else {
        if (retryTimer) clearTimeout(retryTimer)
        showErrorState(wrapper, img, this.url, this.alt, this.width)
      }
    }

    wrapper.appendChild(img)
    return wrapper
  }

  ignoreEvent() {
    return true
  }
}

function showErrorState(wrapper: HTMLSpanElement, img: HTMLImageElement, url: string, alt: string, width?: number) {
  wrapper.innerHTML = ""

  const errorContainer = document.createElement("span")
  errorContainer.style.display = "inline-flex"
  errorContainer.style.alignItems = "center"
  errorContainer.style.gap = "0.5rem"
  errorContainer.style.padding = "0.5rem 0.75rem"
  errorContainer.style.borderRadius = "0.375rem"
  errorContainer.style.backgroundColor = "var(--color-base-300)"
  errorContainer.style.color = "var(--color-base-content)"
  errorContainer.style.fontSize = "0.8125rem"
  if (width) {
    errorContainer.style.width = `${width}px`
    errorContainer.style.maxWidth = "100%"
  }

  const text = document.createElement("span")
  text.style.opacity = "0.7"
  text.textContent = `Failed to load image${alt ? `: ${alt}` : ""}`

  const retryBtn = document.createElement("button")
  retryBtn.textContent = "Retry"
  retryBtn.style.padding = "0.125rem 0.5rem"
  retryBtn.style.borderRadius = "0.25rem"
  retryBtn.style.backgroundColor = "var(--color-accent)"
  retryBtn.style.color = "var(--color-accent-content, #fff)"
  retryBtn.style.fontSize = "0.75rem"
  retryBtn.style.cursor = "pointer"
  retryBtn.style.border = "none"
  retryBtn.style.flexShrink = "0"

  retryBtn.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    wrapper.innerHTML = ""
    img.src = `${url}${url.includes("?") ? "&" : "?"}retry=${Date.now()}`
    let manualRetries = 0
    img.onerror = () => {
      if (manualRetries < MAX_RETRIES) {
        manualRetries++
        setTimeout(() => {
          img.src = `${url}${url.includes("?") ? "&" : "?"}retry=${Date.now()}`
        }, RETRY_DELAY_MS)
      } else {
        showErrorState(wrapper, img, url, alt, width)
      }
    }
    wrapper.appendChild(img)
  }

  errorContainer.appendChild(text)
  errorContainer.appendChild(retryBtn)
  wrapper.appendChild(errorContainer)
}
