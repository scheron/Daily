import {TableWidget} from "@/utils/codemirror/widgets"
import {syntaxTree} from "@codemirror/language"
import {StateField} from "@codemirror/state"
import {Decoration, EditorView} from "@codemirror/view"
import {isSelectionTouching, readonlyMode} from "./wysiwyg"

import type {EditorState, Extension, Range} from "@codemirror/state"
import type {DecorationSet} from "@codemirror/view"

const tableField = StateField.define<DecorationSet>({
  create: (state) => buildTableDecorations(state),
  update(decorations, tr) {
    if (tr.docChanged || tr.selection) return buildTableDecorations(tr.state)
    return decorations.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** The table the selection touches stays raw markdown; in readonly mode every table renders. */
export function createTablesExtension(): Extension {
  return tableField
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const isReadonly = state.facet(readonlyMode)
  const decorations: Range<Decoration>[] = []

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return

      const {from, to} = node
      if (!isReadonly && isSelectionTouching(state, from, to)) return false

      const source = state.doc.sliceString(from, to)
      decorations.push(Decoration.replace({widget: new TableWidget(source, from), block: true}).range(from, to))
      return false
    },
  })

  return Decoration.set(decorations, true)
}
