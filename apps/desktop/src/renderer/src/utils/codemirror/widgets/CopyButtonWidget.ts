import {WidgetType} from "@codemirror/view"

const RESET_DELAY_MS = 1500

/**
 * A "copy" button rendered in the top-right of a fenced code block. Copies the
 * block's content to the clipboard and briefly swaps to a check icon. Reuses the
 * app's `copy`/`check` sprite icons.
 */
export class CopyButtonWidget extends WidgetType {
  constructor(readonly code: string) {
    super()
  }

  eq(other: CopyButtonWidget) {
    return other.code === this.code
  }

  toDOM() {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "cm-code-copy"
    button.title = "Copy code"
    button.setAttribute("aria-label", "Copy code")
    button.setAttribute("contenteditable", "false")
    button.innerHTML = iconMarkup("copy")

    button.addEventListener("mousedown", (event) => event.preventDefault())
    button.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      void navigator.clipboard.writeText(this.code).then(() => {
        button.innerHTML = iconMarkup("check")
        button.classList.add("is-copied")
        setTimeout(() => {
          button.innerHTML = iconMarkup("copy")
          button.classList.remove("is-copied")
        }, RESET_DELAY_MS)
      })
    })

    return button
  }

  ignoreEvent() {
    return true
  }
}

function iconMarkup(name: "copy" | "check"): string {
  return `<svg class="cm-code-copy-icon" width="14" height="14" aria-hidden="true"><use href="#${name}" /></svg>`
}
