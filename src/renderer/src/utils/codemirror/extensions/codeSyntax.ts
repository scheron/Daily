import {CopyButtonWidget} from "@/utils/codemirror/widgets"

import {syntaxTree} from "@codemirror/language"
import {Decoration, ViewPlugin} from "@codemirror/view"
import {getCodeContentRange, getLanguageFromCodeFence} from "../language"
import {readonlyMode} from "./wysiwyg"

import type {Extension, Range} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"

/**
 * Build the decorations for fenced code blocks: per-line backgrounds that give
 * the block its unified "box" look, plus a copy button on the opening line.
 * Token coloring is handled separately by the markdown language extension's
 * `syntaxHighlighting` pass.
 */
function createCodeBlockDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const tree = syntaxTree(view.state)
  const isReadonly = view.state.facet(readonlyMode)

  tree.iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return

      const {from, to} = node
      const languageName = getLanguageFromCodeFence(view, from)

      const firstLine = view.state.doc.lineAt(from)
      const lastLine = view.state.doc.lineAt(to)

      const {contentFrom, contentTo} = getCodeContentRange(view, from, to)
      const firstContentLine = contentFrom < contentTo ? view.state.doc.lineAt(contentFrom) : null
      const lastContentLine = contentFrom < contentTo ? view.state.doc.lineAt(Math.max(contentFrom, contentTo - 1)) : null

      const code = contentFrom < contentTo ? view.state.doc.sliceString(contentFrom, contentTo) : ""
      if (code.trim().length > 0) {
        decorations.push(Decoration.widget({widget: new CopyButtonWidget(code), side: -1}).range(firstLine.from))
      }

      for (let pos = firstLine.from; pos <= lastLine.to; ) {
        const line = view.state.doc.lineAt(pos)
        const isFirst = line.number === firstLine.number
        const isLast = line.number === lastLine.number
        const isContentFirst = firstContentLine && line.number === firstContentLine.number
        const isContentLast = lastContentLine && line.number === lastContentLine.number

        let classes = "cm-codeblock-line"
        if (isFirst) classes += " cm-codeblock-first"
        if (isLast) classes += " cm-codeblock-last"
        if (isReadonly) {
          if (isContentFirst) classes += " cm-codeblock-content-first"
          if (isContentLast) classes += " cm-codeblock-content-last"
        }

        decorations.push(
          Decoration.line({
            class: classes,
            attributes: {"data-language": languageName || "plaintext"},
          }).range(line.from),
        )

        pos = line.to + 1
        if (pos > view.state.doc.length) break
      }
    },
  })

  return Decoration.set(decorations, true)
}

/**
 * Code block plugin — repaints on document and viewport changes.
 */
const codeBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = createCodeBlockDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = createCodeBlockDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

/**
 * Export code block extension (backgrounds + copy button).
 */
export function createCodeSyntaxExtension(): Extension {
  return [codeBlockPlugin]
}
