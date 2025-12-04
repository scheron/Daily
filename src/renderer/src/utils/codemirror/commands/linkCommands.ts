import type {EditorView} from "@codemirror/view"

export type MarkdownCommand = (view: EditorView) => boolean

/**
 * Insert link
 */
export function insertLink(view: EditorView): boolean {
  const {state} = view
  const {from, to} = state.selection.main
  const selectedText = state.doc.sliceString(from, to)

  // For now, insert template - in future, show dialog
  const linkText = selectedText || "link text"
  const markdown = `[${linkText}](url)`

  view.dispatch({
    changes: {from, to, insert: markdown},
    selection: selectedText
      ? {
          // Select "url" part if there was selected text
          anchor: from + markdown.length - 4,
          head: from + markdown.length - 1,
        }
      : {
          // Select "link text" if no selection
          anchor: from + 1,
          head: from + 1 + linkText.length,
        },
  })

  view.focus()
  return true
}

/**
 * Insert image
 * Returns command that needs async image upload
 */
export function insertImage(onImageUpload?: () => Promise<string>): (view: EditorView) => Promise<boolean> {
  return async (view: EditorView): Promise<boolean> => {
    if (!onImageUpload) {
      const template = "![alt text](image-url)"
      const {from} = view.state.selection.main
      view.dispatch({
        changes: {from, insert: template},
        selection: {anchor: from + 2, head: from + 10}, // Select "alt text"
      })
      view.focus()
      return true
    }

    try {
      const markdown = await onImageUpload()
      if (markdown) {
        const {from} = view.state.selection.main
        view.dispatch({
          changes: {from, insert: markdown + "\n"},
          selection: {anchor: from + markdown.length + 1},
        })
        view.focus()
      }
      return true
    } catch (err) {
      console.error("Image upload failed:", err)
      return false
    }
  }
}

/**
 * Link and image commands
 */
export const linkCommands = {
  insertLink,
  insertImage,
}
