import {WidgetType} from "@codemirror/view"

import type {EditorView} from "@codemirror/view"

export class CheckboxWidget extends WidgetType {
  constructor(
    readonly isChecked: boolean,
    readonly pos: number,
    readonly isReadonly: boolean,
  ) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.isChecked === this.isChecked && other.pos === this.pos
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span")
    wrapper.className = "cm-task-marker"
    wrapper.style.display = "inline-flex"
    wrapper.style.alignItems = "center"
    wrapper.style.marginRight = "0.5rem"
    wrapper.style.verticalAlign = "middle"
    wrapper.style.lineHeight = "1.8"
    wrapper.style.height = "1.8em"
    wrapper.style.flexShrink = "0"

    if (this.isReadonly) {
      wrapper.style.cursor = "default"
      wrapper.style.pointerEvents = "none"
    } else {
      wrapper.style.cursor = "pointer"
    }

    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = this.isChecked

    checkbox.className = this.isChecked ? "cm-task-checkbox cm-task-checkbox-checked" : "cm-task-checkbox"

    checkbox.tabIndex = -1

    if (!this.isReadonly) {
      checkbox.onmousedown = (e) => e.preventDefault()
      checkbox.onclick = (e) => {
        e.preventDefault()
        this.toggleCheckbox(view)
        return false
      }
    }

    wrapper.appendChild(checkbox)
    return wrapper
  }

  ignoreEvent() {
    return false
  }

  private toggleCheckbox(view: EditorView) {
    const text = view.state.doc.sliceString(this.pos, this.pos + 3)

    if (text === "[ ]" || text === "[x]" || text === "[X]") {
      const newText = this.isChecked ? "[ ]" : "[x]"

      const currentSelection = view.state.selection.main

      view.dispatch({
        changes: {
          from: this.pos,
          to: this.pos + 3,
          insert: newText,
        },
        selection: {anchor: currentSelection.anchor, head: currentSelection.head},
      })
    }
  }
}
