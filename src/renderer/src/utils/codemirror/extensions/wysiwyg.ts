import {CheckboxWidget, ImageWidget, LinkWidget} from "@/utils/codemirror/widgets"

import {syntaxTree} from "@codemirror/language"
import {Facet} from "@codemirror/state"
import {Decoration, ViewPlugin} from "@codemirror/view"

import type {EditorState, Extension, Range} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"

/**
 * Facet carrying the editor's readonly state. In readonly mode every marker is
 * hidden (nothing is "active"), so previews render cleanly with no raw syntax.
 */
export const readonlyMode = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
})

const hide = Decoration.replace({})
const inlineCodeMark = Decoration.mark({class: "cm-code"})
const subtleMark = Decoration.mark({class: "cm-marker-subtle"})
const hrMark = Decoration.mark({class: "cm-hr"})

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/
const IMAGE_RE = /!\[([^\]]*?)\s*(?:=(\d+)x(\d+))?\]\(([^)]+)\)/

/**
 * Build the live-preview decoration set: hides markdown syntax markers on lines
 * the selection doesn't touch (Obsidian-style WYSIWYG), renders task/image/link
 * widgets, and collapses fenced-code fence lines. Token styling itself comes
 * from the `syntaxHighlighting` pass, not from here.
 *
 * @param state - Editor state holding the document and selection
 * @param isFocused - Whether the editor has focus (raw markdown is only revealed while focused)
 */
export function createWYSIWYGDecorations(state: EditorState, isFocused: boolean): DecorationSet {
  const isReadonly = state.facet(readonlyMode)
  const interactive = isFocused && !isReadonly

  const activeLines = new Set<number>()
  if (interactive) {
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number
      const last = state.doc.lineAt(range.to).number
      for (let line = first; line <= last; line++) activeLines.add(line)
    }
  }

  const lineActive = (pos: number) => activeLines.has(state.doc.lineAt(pos).number)
  const selectionTouches = (from: number, to: number) => {
    if (!interactive) return false
    for (const range of state.selection.ranges) {
      if (range.empty ? range.from >= from && range.from <= to : Math.max(range.from, from) < Math.min(range.to, to)) return true
    }
    return false
  }

  const decorations: Range<Decoration>[] = []
  const tree = syntaxTree(state)

  tree.iterate({
    enter: (node) => {
      const {name, from, to} = node

      switch (name) {
        case "HeaderMark":
        case "QuoteMark": {
          if (lineActive(from)) break
          let end = to
          const next = state.doc.sliceString(end, end + 1)
          if (next === " " || next === "\t") end += 1
          decorations.push(hide.range(from, end))
          break
        }

        case "EmphasisMark":
        case "StrikethroughMark": {
          if (lineActive(from)) break
          decorations.push(hide.range(from, to))
          break
        }

        case "ListMark": {
          if (lineActive(from)) break
          decorations.push(subtleMark.range(from, to))
          break
        }

        case "InlineCode": {
          if (lineActive(from)) break
          const open = node.node.firstChild
          const close = node.node.lastChild
          if (!open || !close || open === close) break
          decorations.push(hide.range(open.from, open.to))
          if (close.from > open.to) decorations.push(inlineCodeMark.range(open.to, close.from))
          decorations.push(hide.range(close.from, close.to))
          return false
        }

        // Fenced-code fences (``` and the language label) are left as real,
        // navigable lines — matching zennotes. Collapsing them to zero height
        // traps the cursor on the hidden closing fence, so you can't move out
        // of the block with the arrow keys.

        case "LinkMark": {
          if (selectionTouches(from, to)) break
          decorations.push(hide.range(from, to))
          break
        }

        case "URL": {
          if (state.doc.sliceString(from - 1, from) !== "(") break
          if (selectionTouches(from, to)) break
          decorations.push(hide.range(from, to))
          break
        }

        case "Link": {
          if (!isReadonly) break
          const match = state.doc.sliceString(from, to).match(LINK_RE)
          if (!match) break
          decorations.push(Decoration.replace({widget: new LinkWidget(match[1], match[2])}).range(from, to))
          return false
        }

        case "Image": {
          if (lineActive(from)) break
          const match = state.doc.sliceString(from, to).match(IMAGE_RE)
          if (!match) break
          const width = match[2] ? parseInt(match[2]) : undefined
          const height = match[3] ? parseInt(match[3]) : undefined
          decorations.push(Decoration.replace({widget: new ImageWidget(match[4], match[1] || "image", width, height)}).range(from, to))
          return false
        }

        case "TaskMarker": {
          if (selectionTouches(from, to)) break
          const checked = /\[x\]/i.test(state.doc.sliceString(from, to))
          decorations.push(Decoration.widget({widget: new CheckboxWidget(checked, from, isReadonly), side: -1}).range(from))
          decorations.push(hide.range(from, to))
          return false
        }

        case "HorizontalRule": {
          if (lineActive(from)) break
          decorations.push(hrMark.range(from, to))
          break
        }
      }

      return undefined
    },
  })

  return Decoration.set(decorations, true)
}

/**
 * Live-preview plugin — recomputes decorations on document, selection, and
 * focus changes so markers fade in/out as the cursor moves.
 */
const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = createWYSIWYGDecorations(view.state, view.hasFocus)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.focusChanged) {
        this.decorations = createWYSIWYGDecorations(update.view.state, update.view.hasFocus)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

/**
 * WYSIWYG (live-preview) extension.
 *
 * @param options - Configuration options
 * @param options.readonly - If true, always render previews (never reveal raw markdown)
 */
export function createWYSIWYGExtension(options: {readonly?: boolean} = {}): Extension {
  return [readonlyMode.of(options.readonly ?? false), wysiwygPlugin]
}
