import type {EditorView} from "@codemirror/view"

export function getLanguageFromCodeFence(view: EditorView, fenceStart: number): string | null {
  const line = view.state.doc.lineAt(fenceStart)
  const match = line.text.match(/^```(\w+)/)
  return match ? match[1] : null
}

export function getCodeContentRange(view: EditorView, fenceFrom: number, fenceTo: number) {
  const firstLine = view.state.doc.lineAt(fenceFrom)
  const lastLine = view.state.doc.lineAt(fenceTo)

  const contentFrom = firstLine.to + 1
  const contentTo = Math.max(contentFrom, lastLine.from)

  return {contentFrom, contentTo}
}
