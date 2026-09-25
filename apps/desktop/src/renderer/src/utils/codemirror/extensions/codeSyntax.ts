import {getCodeContentRange, getLanguageFromCodeFence} from "@/utils/codemirror/language"
import {CopyButtonWidget} from "@/utils/codemirror/widgets"
import {syntaxTree} from "@codemirror/language"
import {Decoration, ViewPlugin} from "@codemirror/view"
import {readonlyMode} from "./wysiwyg"

import type {EditorState, Extension, Range} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"
import type {Tree} from "@lezer/common"

const codeBlockPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCodeBlockDecorations(view.state, syntaxTree(view.state))
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCodeBlockDecorations(update.view.state, syntaxTree(update.view.state))
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

export function createCodeSyntaxExtension(): Extension {
  return [codeBlockPlugin]
}

/** The read-only preview renders the same set, so the editor and the previews cannot drift. */
export function buildCodeBlockDecorations(state: EditorState, tree: Tree): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const isReadonly = state.facet(readonlyMode)

  tree.iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return

      const {from, to} = node
      const languageName = getLanguageFromCodeFence(state.doc, from)

      const firstLine = state.doc.lineAt(from)
      const lastLine = state.doc.lineAt(to)

      const {contentFrom, contentTo} = getCodeContentRange(state.doc, from, to)
      const firstContentLine = contentFrom < contentTo ? state.doc.lineAt(contentFrom) : null
      const lastContentLine = contentFrom < contentTo ? state.doc.lineAt(Math.max(contentFrom, contentTo - 1)) : null

      const code = contentFrom < contentTo ? state.doc.sliceString(contentFrom, contentTo) : ""
      if (code.trim().length > 0) {
        decorations.push(Decoration.widget({widget: new CopyButtonWidget(code), side: -1}).range(firstLine.from))
      }

      for (let pos = firstLine.from; pos <= lastLine.to; ) {
        const line = state.doc.lineAt(pos)
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
        if (pos > state.doc.length) break
      }
    },
  })

  return Decoration.set(decorations, true)
}
