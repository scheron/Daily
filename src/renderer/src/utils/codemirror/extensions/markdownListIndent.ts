import {isNull, notNull} from "@shared/utils/common/validators"

import {syntaxTree} from "@codemirror/language"
import {RangeSetBuilder} from "@codemirror/state"
import {Decoration, ViewPlugin} from "@codemirror/view"

import type {Extension} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"

const LEADING_LIST_MARKER_RE = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)(?:\[[ xX]\](?:[ \t]+|$))?/
const LIST_MARKER_FROM_OFFSET_RE = /^(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)(?:\[[ xX]\](?:[ \t]+|$))?/

function visualColumn(text: string): number {
  let column = 0
  for (const char of text) {
    column += char === "\t" ? 4 : 1
  }
  return column
}

export function markdownListHangingIndentCh(lineText: string, markerOffset = 0): number | null {
  if (markerOffset < 0 || markerOffset > lineText.length) return null

  const markerText = lineText.slice(markerOffset)
  const match = markerOffset === 0 ? lineText.match(LEADING_LIST_MARKER_RE) : markerText.match(LIST_MARKER_FROM_OFFSET_RE)
  if (!match) return null

  return Math.max(1, visualColumn(lineText.slice(0, markerOffset) + match[0]))
}

function listMarkerOffsetForLine(view: EditorView, lineFrom: number, lineTo: number): number | null {
  let offset: number | null = null

  syntaxTree(view.state).iterate({
    from: lineFrom,
    to: lineTo,
    enter: (node) => {
      if (notNull(offset)) return false
      if (node.name !== "ListMark") return

      offset = node.from - lineFrom
      return false
    },
  })

  return offset
}

function createDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const decoratedLines = new Set<number>()

  for (const {from, to} of view.visibleRanges) {
    const firstLine = view.state.doc.lineAt(from).number
    const lastLine = view.state.doc.lineAt(Math.max(from, to - 1)).number

    for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber++) {
      if (decoratedLines.has(lineNumber)) continue

      const line = view.state.doc.line(lineNumber)
      const markerOffset = listMarkerOffsetForLine(view, line.from, line.to)
      if (isNull(markerOffset)) continue

      const indentCh = markdownListHangingIndentCh(line.text, markerOffset)
      if (isNull(indentCh)) continue

      decoratedLines.add(lineNumber)
      builder.add(
        line.from,
        line.from,
        Decoration.line({
          class: "cm-markdown-list-line",
          attributes: {
            style: `padding-left: ${indentCh}ch; text-indent: -${indentCh}ch;`,
          },
        }),
      )
    }
  }

  return builder.finish()
}

export function createMarkdownListIndentExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = createDecorations(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = createDecorations(update.view)
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  )
}
