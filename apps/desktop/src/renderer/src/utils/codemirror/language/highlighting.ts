import type {Text} from "@codemirror/state"
import type {SyntaxNode} from "@lezer/common"

/** The first word of a fenced block's info string, read from the markdown `CodeInfo` node; `null` when the fence names no language. */
export function getLanguageFromCodeFence(doc: Text, fence: SyntaxNode): string | null {
  const info = fence.getChild("CodeInfo")
  if (!info) return null
  return doc.sliceString(info.from, info.to).trim().split(/\s/)[0] || null
}

/** Whether a closing fence follows the opening line; an unclosed fence runs to the end of the document. */
export function isFenceClosed(doc: Text, fence: SyntaxNode): boolean {
  const openingEnd = doc.lineAt(fence.from).to
  return fence.getChildren("CodeMark").some((mark) => mark.from > openingEnd)
}

export function getCodeContentRange(doc: Text, fenceFrom: number, fenceTo: number, isClosed: boolean) {
  const firstLine = doc.lineAt(fenceFrom)
  const contentFrom = Math.min(firstLine.to + 1, doc.length)

  if (!isClosed) return {contentFrom, contentTo: Math.max(contentFrom, fenceTo)}

  const lastLine = doc.lineAt(fenceTo)
  return {contentFrom, contentTo: Math.max(contentFrom, lastLine.from)}
}
