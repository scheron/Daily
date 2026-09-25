import type {Text} from "@codemirror/state"

export function getLanguageFromCodeFence(doc: Text, fenceStart: number): string | null {
  const line = doc.lineAt(fenceStart)
  const match = line.text.match(/^```(\w+)/)
  return match ? match[1] : null
}

export function getCodeContentRange(doc: Text, fenceFrom: number, fenceTo: number) {
  const firstLine = doc.lineAt(fenceFrom)
  const lastLine = doc.lineAt(fenceTo)

  const contentFrom = firstLine.to + 1
  const contentTo = Math.max(contentFrom, lastLine.from)

  return {contentFrom, contentTo}
}
