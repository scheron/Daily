import type {EditorView} from "@codemirror/view"

export type MarkdownCommand = (view: EditorView) => boolean

/**
 * Toggle inline marker (bold, italic, code, strikethrough)
 */
function toggleInlineMarker(marker: string): MarkdownCommand {
  return (view: EditorView): boolean => {
    const {state} = view
    const {from, to} = state.selection.main

    if (from === to) {
      // No selection: insert markers and place cursor between them
      view.dispatch({
        changes: {from, insert: marker + marker},
        selection: {anchor: from + marker.length},
      })
    } else {
      // Has selection: check if already wrapped
      const markerLen = marker.length
      const before = state.doc.sliceString(Math.max(0, from - markerLen), from)
      const after = state.doc.sliceString(to, Math.min(state.doc.length, to + markerLen))
      const selectedText = state.doc.sliceString(from, to)

      if (before === marker && after === marker) {
        // Remove markers
        view.dispatch({
          changes: [
            {from: from - markerLen, to: from},
            {from: to, to: to + markerLen},
          ],
          selection: {anchor: from - markerLen, head: to - markerLen},
        })
      } else {
        // Add markers
        view.dispatch({
          changes: {from, to, insert: `${marker}${selectedText}${marker}`},
          selection: {anchor: from, head: to + markerLen * 2},
        })
      }
    }

    view.focus()
    return true
  }
}

/**
 * Clear formatting from selection
 */
export function clearFormatting(view: EditorView): boolean {
  const {state} = view
  const {from, to} = state.selection.main

  if (from === to) return false

  let text = state.doc.sliceString(from, to)

  // Remove common markdown formatting
  text = text
    .replace(/\*\*(.+?)\*\*/g, "$1") // Bold
    .replace(/\*(.+?)\*/g, "$1") // Italic
    .replace(/__(.+?)__/g, "$1") // Bold (alt)
    .replace(/_(.+?)_/g, "$1") // Italic (alt)
    .replace(/`(.+?)`/g, "$1") // Inline code
    .replace(/~~(.+?)~~/g, "$1") // Strikethrough
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // Links

  view.dispatch({
    changes: {from, to, insert: text},
    selection: {anchor: from, head: from + text.length},
  })

  view.focus()
  return true
}

/**
 * Inline formatting commands
 */
export const inlineCommands = {
  toggleBold: toggleInlineMarker("**"),
  toggleItalic: toggleInlineMarker("*"),
  toggleCode: toggleInlineMarker("`"),
  toggleStrikethrough: toggleInlineMarker("~~"),
  clearFormatting,
}
