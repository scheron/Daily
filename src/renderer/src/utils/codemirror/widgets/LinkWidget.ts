import {WidgetType} from "@codemirror/view"

/**
 * Widget for rendering clickable links in readonly mode
 * Converts markdown links [text](url) to actual clickable anchor elements
 */
export class LinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly url: string,
  ) {
    super()
  }

  eq(other: LinkWidget) {
    return other.url === this.url && other.text === this.text
  }

  toDOM() {
    const link = document.createElement("a")
    link.href = this.url
    link.textContent = this.text
    link.className = "cm-link-widget"
    link.style.color = "var(--color-info)"
    link.style.textDecoration = "none"
    link.style.cursor = "pointer"

    // Open links externally in browser (works in Electron)
    link.onclick = (e) => {
      e.preventDefault()
      window.BridgeIPC["shell:open-external"](this.url)
      return false
    }

    // Add hover effect
    link.onmouseenter = () => {
      link.style.textDecoration = "underline"
    }
    link.onmouseleave = () => {
      link.style.textDecoration = "none"
    }

    return link
  }

  ignoreEvent() {
    return false
  }
}
