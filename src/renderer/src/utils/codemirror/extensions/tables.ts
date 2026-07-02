import {TableWidget} from "@/utils/codemirror/widgets"

import {syntaxTree} from "@codemirror/language"
import {StateField} from "@codemirror/state"
import {Decoration, EditorView} from "@codemirror/view"
import {readonlyMode} from "./wysiwyg"

import type {EditorState, Extension, Range} from "@codemirror/state"
import type {DecorationSet} from "@codemirror/view"

/**
 * Build block decorations that replace each GFM table with a rendered `<table>`,
 * except the table the selection currently sits in (so it stays editable). In
 * readonly mode every table is rendered.
 *
 * Block-level (line-crossing) decorations must come from a state field rather
 * than a view plugin — they affect vertical layout, which CodeMirror computes
 * before plugins run.
 */
function buildTableDecorations(state: EditorState): DecorationSet {
  const isReadonly = state.facet(readonlyMode)
  const decorations: Range<Decoration>[] = []

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return

      const {from, to} = node
      if (!isReadonly && selectionTouches(state, from, to)) return false

      const source = state.doc.sliceString(from, to)
      decorations.push(Decoration.replace({widget: new TableWidget(source, from), block: true}).range(from, to))
      return false
    },
  })

  return Decoration.set(decorations, true)
}

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty ? range.from >= from && range.from <= to : Math.max(range.from, from) < Math.min(range.to, to)) return true
  }
  return false
}

const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) return buildTableDecorations(tr.state)
    return decorations.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

/**
 * Table live-preview extension — renders markdown tables as `<table>` outside of
 * the cursor's table.
 */
export function createTablesExtension(): Extension {
  return tableField
}
