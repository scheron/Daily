import {WidgetType} from "@codemirror/view"

import type {EditorView} from "@codemirror/view"

/**
 * Widget for rendering interactive checkboxes in task lists
 * formats [ ] and [x] markdown syntax
 *
 * In edit mode: Checkboxes are interactive and can be toggled
 * In readonly mode: Checkboxes are displayed but not interactive
 */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
    readonly isReadonly: boolean,
  ) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span")
    wrapper.className = "cm-task-marker"
    wrapper.style.display = "inline-flex"
    wrapper.style.alignItems = "center"
    wrapper.style.marginRight = "0.5rem"
    wrapper.style.verticalAlign = "middle"
    wrapper.style.lineHeight = "1.8" // Ensure consistent line height

    // Apply readonly styles to wrapper
    if (this.isReadonly) {
      wrapper.style.cursor = "default"
      wrapper.style.pointerEvents = "none" // Prevent any interaction
    } else {
      wrapper.style.cursor = "pointer"
    }

    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = this.checked

    // Apply CSS classes from theme (checkmark is created via ::after pseudo-element)
    checkbox.className = this.checked ? "cm-task-checkbox cm-task-checkbox-checked" : "cm-task-checkbox"

    // Only add click formatr in edit mode
    if (!this.isReadonly) {
      checkbox.onclick = (e) => {
        e.preventDefault()
        this.toggleCheckbox(view)
        return false
      }
    }

    wrapper.appendChild(checkbox)
    return wrapper
  }

  toggleCheckbox(view: EditorView) {
    // Find the task marker text ([ ] or [x])
    const text = view.state.doc.sliceString(this.pos, this.pos + 3)

    if (text === "[ ]" || text === "[x]" || text === "[X]") {
      const newText = this.checked ? "[ ]" : "[x]"

      // Save current cursor position
      const currentSelection = view.state.selection.main

      view.dispatch({
        changes: {
          from: this.pos,
          to: this.pos + 3,
          insert: newText,
        },
        // Preserve cursor position
        selection: {anchor: currentSelection.anchor, head: currentSelection.head},
      })
    }
  }

  ignoreEvent() {
    return false
  }
}
