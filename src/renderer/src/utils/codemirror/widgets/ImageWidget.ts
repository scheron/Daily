import {WidgetType} from "@codemirror/view"

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

    // Apply specific dimensions if provided
    if (this.width) {
      img.style.width = `${this.width}px`
    }
    if (this.height) {
      img.style.height = `${this.height}px`
    }

    // format image load errors
    img.onerror = () => {
      wrapper.innerHTML = `<span style="color: var(--color-error); font-style: italic;">Failed to load image: ${this.alt}</span>`
    }

    wrapper.appendChild(img)
    return wrapper
  }

  ignoreEvent() {
    return true
  }
}
