import {CheckboxWidget, ImageWidget, LinkWidget} from "@/utils/codemirror/widgets"
import {syntaxTree} from "@codemirror/language"
import {Facet} from "@codemirror/state"
import {Decoration, ViewPlugin} from "@codemirror/view"

import type {EditorState, Extension, Range} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"
import type {Tree} from "@lezer/common"

/** Set by `createWYSIWYGExtension`; reads `false` in an editor without that extension. */
export const readonlyMode = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
})

const hide = Decoration.replace({})
const inlineCodeMark = Decoration.mark({class: "cm-code"})
const subtleMark = Decoration.mark({class: "cm-marker-subtle"})
const hrMark = Decoration.mark({class: "cm-hr"})

const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildWYSIWYGDecorations(view.state, syntaxTree(view.state), view.hasFocus)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildWYSIWYGDecorations(update.view.state, syntaxTree(update.view.state), update.view.hasFocus)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

export function isSelectionTouching(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.empty ? range.from >= from && range.from <= to : Math.max(range.from, from) < Math.min(range.to, to)) return true
  }
  return false
}

/** Syntax is hidden except on the lines the selection touches while the editor is focused; with `isReadonly` it is never revealed. */
export function createWYSIWYGExtension(options: {isReadonly: boolean}): Extension {
  return [readonlyMode.of(options.isReadonly), wysiwygPlugin]
}

/** The read-only preview renders the same set, so the editor and the previews cannot drift. */
export function buildWYSIWYGDecorations(state: EditorState, tree: Tree, isFocused: boolean): DecorationSet {
  const isReadonly = state.facet(readonlyMode)
  const isInteractive = isFocused && !isReadonly

  const activeLines = new Set<number>()
  if (isInteractive) {
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number
      const last = state.doc.lineAt(range.to).number
      for (let line = first; line <= last; line++) activeLines.add(line)
    }
  }

  const isLineActive = (pos: number) => activeLines.has(state.doc.lineAt(pos).number)

  const decorations: Range<Decoration>[] = []

  tree.iterate({
    enter: (node) => {
      const {name, from, to} = node

      switch (name) {
        case "HeaderMark":
        case "QuoteMark": {
          if (isLineActive(from)) break
          let end = to
          const next = state.doc.sliceString(end, end + 1)
          if (next === " " || next === "\t") end += 1
          decorations.push(hide.range(from, end))
          break
        }

        case "EmphasisMark":
        case "StrikethroughMark": {
          if (isLineActive(from)) break
          decorations.push(hide.range(from, to))
          break
        }

        case "ListMark": {
          if (isLineActive(from)) break
          decorations.push(subtleMark.range(from, to))
          break
        }

        case "InlineCode": {
          if (isLineActive(from)) break
          const open = node.node.firstChild
          const close = node.node.lastChild
          if (!open || !close || open === close) break
          decorations.push(hide.range(open.from, open.to))
          if (close.from > open.to) decorations.push(inlineCodeMark.range(open.to, close.from))
          decorations.push(hide.range(close.from, close.to))
          return false
        }

        case "LinkMark": {
          if (isLineActive(from)) break
          decorations.push(hide.range(from, to))
          break
        }

        case "URL": {
          if (state.doc.sliceString(from - 1, from) !== "(") break
          if (isLineActive(from)) break
          decorations.push(hide.range(from, to))
          break
        }

        case "Link": {
          if (!isReadonly) break
          const match = state.doc.sliceString(from, to).match(/\[([^\]]+)\]\(([^)]+)\)/)
          if (!match) break
          decorations.push(Decoration.replace({widget: new LinkWidget(match[1], match[2])}).range(from, to))
          return false
        }

        case "Image": {
          if (isLineActive(from)) break
          const match = state.doc.sliceString(from, to).match(/!\[([^\]]*?)\s*(?:=(\d+)x(\d+))?\]\(([^)]+)\)/)
          if (!match) break
          const width = match[2] ? parseInt(match[2]) : undefined
          const height = match[3] ? parseInt(match[3]) : undefined
          decorations.push(Decoration.replace({widget: new ImageWidget(match[4], match[1] || "image", width, height)}).range(from, to))
          return false
        }

        case "TaskMarker": {
          if (isInteractive && isSelectionTouching(state, from, to)) break
          const isChecked = /\[x\]/i.test(state.doc.sliceString(from, to))
          decorations.push(Decoration.widget({widget: new CheckboxWidget(isChecked, from, isReadonly), side: -1}).range(from))
          decorations.push(hide.range(from, to))
          return false
        }

        case "HorizontalRule": {
          if (isLineActive(from)) break
          decorations.push(hrMark.range(from, to))
          break
        }
      }

      return undefined
    },
  })

  return Decoration.set(decorations, true)
}
