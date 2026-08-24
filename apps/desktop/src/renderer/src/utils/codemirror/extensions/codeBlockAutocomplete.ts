import {EditorView} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

/**
 * Auto-complete code blocks when typing ```
 * When user types the third backtick at the start of a line,
 * automatically insert a closing fence on a new line below
 */
export function createCodeBlockAutocomplete(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    // Check if we're inserting a backtick
    if (text !== "`") return false

    const pos = from
    const doc = view.state.doc
    const line = doc.lineAt(pos)
    const textBeforeCursor = doc.sliceString(line.from, pos)

    // Check if this would complete a ``` sequence at the start of a line
    // (allowing for leading whitespace)
    const match = textBeforeCursor.match(/^\s*``$/)

    if (match) {
      // This is the third backtick - auto-complete the code block
      const indent = match[0].match(/^\s*/)?.[0] || ""

      // Insert the third backtick, a newline, and closing fence
      const insertion = "`\n" + indent + "```"

      view.dispatch({
        changes: {from, to, insert: insertion},
        selection: {anchor: from + 1}, // Position cursor after the third backtick
      })

      return true
    }

    return false
  })
}
