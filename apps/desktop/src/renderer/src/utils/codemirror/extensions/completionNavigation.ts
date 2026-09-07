import {completionStatus, moveCompletionSelection} from "@codemirror/autocomplete"
import {Prec} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

export function completionNavDirection(event: KeyboardEvent): "next" | "previous" | null {
  if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null

  switch (event.key.toLowerCase()) {
    case "n":
    case "j":
      return "next"
    case "p":
    case "k":
      return "previous"
    default:
      return null
  }
}

export function createCompletionNavigationExtension(): Extension {
  return Prec.highest(
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        const direction = completionNavDirection(event)
        if (!direction) return false
        if (completionStatus(view.state) !== "active") return false

        const moved = moveCompletionSelection(direction === "next")(view)
        if (!moved) return false

        event.preventDefault()
        event.stopPropagation()
        return true
      },
    }),
  )
}
