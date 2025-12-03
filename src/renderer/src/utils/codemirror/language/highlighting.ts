import {getCachedLanguage} from "@/utils/codemirror/language/cache"

import {Decoration} from "@codemirror/view"
import {classHighlighter, highlightTree} from "@lezer/highlight"

import type {RangeSetBuilder} from "@codemirror/state"
import type {EditorView} from "@codemirror/view"

/**
 * Extract language name from code fence opening line
 */
export function getLanguageFromCodeFence(view: EditorView, fenceStart: number): string | null {
  const line = view.state.doc.lineAt(fenceStart)
  const text = line.text

  // Match ```language
  const match = text.match(/^```(\w+)/)
  return match ? match[1] : null
}

/**
 * Get code content range (excluding fence markers)
 */
export function getCodeContentRange(view: EditorView, fenceFrom: number, fenceTo: number) {
  const firstLine = view.state.doc.lineAt(fenceFrom)
  const lastLine = view.state.doc.lineAt(fenceTo)

  // Start after first line (opening ```)
  const contentFrom = firstLine.to + 1

  // End at start of last line (closing ```)
  const contentTo = Math.max(contentFrom, lastLine.from)

  return {contentFrom, contentTo}
}

/**
 * Apply syntax highlighting to code block content
 * Only works if language is already loaded (synchronous)
 */
export function highlightCodeBlock(
  view: EditorView,
  builder: RangeSetBuilder<Decoration>,
  fenceFrom: number,
  fenceTo: number,
  languageName: string | null,
): void {
  if (!languageName) return

  // Get cached language (synchronously)
  const lang = getCachedLanguage(languageName)
  if (!lang) return

  const {contentFrom, contentTo} = getCodeContentRange(view, fenceFrom, fenceTo)
  if (contentFrom >= contentTo) return

  const codeText = view.state.doc.sliceString(contentFrom, contentTo)

  try {
    // Parse the code with the language parser
    const tree = lang.language.parser.parse(codeText)

    // Apply syntax highlighting decorations using classHighlighter
    // classHighlighter automatically maps Lezer tags to CSS classes
    highlightTree(tree, classHighlighter, (from: number, to: number, classes: string) => {
      // Offset positions to match document positions
      const decorationFrom = contentFrom + from
      const decorationTo = contentFrom + to

      if (classes && decorationFrom < decorationTo && decorationTo <= view.state.doc.length) {
        builder.add(
          decorationFrom,
          decorationTo,
          Decoration.mark({
            class: classes,
          }),
        )
      }
    })
  } catch (err) {
    console.warn(`Failed to highlight code block:`, err)
  }
}
