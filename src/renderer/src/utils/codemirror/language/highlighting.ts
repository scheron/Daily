import type {EditorView} from "@codemirror/view"

/**
 * Extract the language name from a code fence opening line (```language).
 *
 * @param view - The editor view
 * @param fenceStart - Document offset of the fence's opening marker
 * @example getLanguageFromCodeFence(view, node.from) // → "ts" | null
 */
export function getLanguageFromCodeFence(view: EditorView, fenceStart: number): string | null {
  const line = view.state.doc.lineAt(fenceStart)
  const match = line.text.match(/^```(\w+)/)
  return match ? match[1] : null
}

/**
 * Get a fenced block's content range, excluding the opening/closing fence lines.
 *
 * @param view - The editor view
 * @param fenceFrom - Document offset of the block's start (opening fence)
 * @param fenceTo - Document offset of the block's end (closing fence)
 * @example const {contentFrom, contentTo} = getCodeContentRange(view, from, to)
 */
export function getCodeContentRange(view: EditorView, fenceFrom: number, fenceTo: number) {
  const firstLine = view.state.doc.lineAt(fenceFrom)
  const lastLine = view.state.doc.lineAt(fenceTo)

  const contentFrom = firstLine.to + 1
  const contentTo = Math.max(contentFrom, lastLine.from)

  return {contentFrom, contentTo}
}
