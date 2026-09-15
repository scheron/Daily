import type {EditorView} from "@codemirror/view"

export const linkCommands = {
  insertLink,
}

function insertLink(view: EditorView): boolean {
  const {state} = view
  const {from, to} = state.selection.main
  const selectedText = state.doc.sliceString(from, to)

  const linkText = selectedText || "link text"
  const markdown = `[${linkText}](url)`

  view.dispatch({
    changes: {from, to, insert: markdown},
    selection: selectedText
      ? {
          anchor: from + markdown.length - 4,
          head: from + markdown.length - 1,
        }
      : {
          anchor: from + 1,
          head: from + 1 + linkText.length,
        },
  })

  view.focus()
  return true
}
