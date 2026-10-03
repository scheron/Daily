import {getCodeContentRange, getLanguageFromCodeFence, isFenceClosed} from "@/utils/codemirror/language"
import {CodeBlockScrollbarWidget, CodeBlockWidget, CopyButtonWidget} from "@/utils/codemirror/widgets"
import {syntaxTree} from "@codemirror/language"
import {StateField} from "@codemirror/state"
import {Decoration, EditorView} from "@codemirror/view"
import {createCodeBlockScrollExtension} from "./codeBlockScroll"
import {isSelectionTouching, readonlyMode} from "./wysiwyg"

import type {EditorState, Extension, Range} from "@codemirror/state"
import type {DecorationSet} from "@codemirror/view"
import type {Tree} from "@lezer/common"

export type CodeBlockDecorationOptions = {
  /** Absolute document ranges drawn as search matches inside a read-only widget. */
  highlights?: readonly (readonly [number, number])[]
  /** A read-only widget cuts long lines off instead of scrolling. */
  isClipped?: boolean
}

const codeBlockField = StateField.define<DecorationSet>({
  create: (state) => buildCodeBlockDecorations(state, syntaxTree(state)),
  update(decorations, tr) {
    if (tr.docChanged || (tr.selection && !tr.startState.selection.eq(tr.state.selection)))
      return buildCodeBlockDecorations(tr.state, syntaxTree(tr.state))
    return decorations.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** The block the selection touches stays raw markdown; elsewhere a block is one scrolling widget, and in readonly mode every block is drawn line by line. */
export function createCodeSyntaxExtension(): Extension {
  return [codeBlockField, createCodeBlockScrollExtension()]
}

/** The read-only preview renders the same set, so the editor and the previews cannot drift. */
export function buildCodeBlockDecorations(state: EditorState, tree: Tree, options: CodeBlockDecorationOptions = {}): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const isReadonly = state.facet(readonlyMode)

  tree.iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return

      const {from, to} = node
      const languageName = getLanguageFromCodeFence(state.doc, node.node)

      const isClosed = isFenceClosed(state.doc, node.node)
      const firstLine = state.doc.lineAt(from)
      const lastLine = state.doc.lineAt(to)

      const {contentFrom, contentTo} = getCodeContentRange(state.doc, from, to, isClosed)
      const code = contentFrom < contentTo ? state.doc.sliceString(contentFrom, contentTo) : ""

      const isWholeLines = from === firstLine.from && to === lastLine.to
      if (isClosed && isWholeLines && (isReadonly || !isSelectionTouching(state, from, to))) {
        const highlights = (options.highlights ?? [])
          .filter(([start, end]) => end > contentFrom && start < contentTo)
          .map(([start, end]) => [Math.max(start, contentFrom) - contentFrom, Math.min(end, contentTo) - contentFrom] as const)
        const widget = new CodeBlockWidget(code.replace(/\n$/, ""), languageName, {highlights, isClipped: isReadonly && options.isClipped})
        decorations.push(Decoration.replace({widget, block: true}).range(from, to))
        return false
      }

      const firstContentLine = contentFrom < contentTo ? state.doc.lineAt(contentFrom) : null
      const lastContentLine = contentFrom < contentTo ? state.doc.lineAt(contentTo - 1) : null

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
        if (!isReadonly) classes += " cm-codeblock-raw"
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

      if (!isReadonly) decorations.push(Decoration.widget({widget: new CodeBlockScrollbarWidget(), block: true, side: 1}).range(lastLine.to))
    },
  })

  return Decoration.set(decorations, true)
}
