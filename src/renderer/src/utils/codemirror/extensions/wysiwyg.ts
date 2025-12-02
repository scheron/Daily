import {syntaxTree} from "@codemirror/language"
import {Facet, RangeSetBuilder} from "@codemirror/state"
import {ViewPlugin} from "@codemirror/view"
import {formatBlockquote, formatHeading, formatHorizontalRule, formatQuoteMark} from "../decorations/blocks"
import {formatCodeInfo, formatCodeMark} from "../decorations/code"
import {formatEmphasis, formatImage, formatInlineCode, formatLink, formatStrikethrough, formatStrongEmphasis} from "../decorations/inline"
import {formatListMark, formatTaskMarker} from "../decorations/lists"

import type {Extension} from "@codemirror/state"
import type {Decoration, DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"

/**
 * Facet for storing readonly mode state
 */
export const readonlyMode = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
})

/**
 * Create WYSIWYG decorations for markdown content
 * Delegates to specific formatters based on node type
 */
function createWYSIWYGDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const {state} = view
  const tree = syntaxTree(state)
  const selection = state.selection.main
  const cursorPos = selection.head
  const hasSelection = selection.from !== selection.to
  const isReadonly = state.facet(readonlyMode)

  function shouldShowRaw(from: number, to: number): boolean {
    if (isReadonly) return false

    const cursorInRange = cursorPos >= from && cursorPos <= to
    const selectionOverlaps = hasSelection && selection.from < to && selection.to > from

    return cursorInRange || selectionOverlaps
  }

  tree.iterate({
    enter: (node) => {
      const {from, to, name} = node
      const showRaw = shouldShowRaw(from, to)

      try {
        switch (name) {
          // Inline formatting
          case "StrongEmphasis":
            formatStrongEmphasis(builder, state, from, to, showRaw)
            break

          case "Emphasis":
            formatEmphasis(builder, state, from, to, showRaw)
            break

          case "InlineCode":
            formatInlineCode(builder, state, from, to, showRaw)
            break

          case "Strikethrough":
            formatStrikethrough(builder, state, from, to, showRaw)
            break

          case "Link":
            formatLink(builder, state, from, to, showRaw)
            break

          case "Image":
            formatImage(builder, state, from, to, showRaw, isReadonly)
            break

          // Headings
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6":
            const level = parseInt(name.slice(-1))
            formatHeading(builder, state, from, to, level, showRaw)
            break

          // Blockquotes
          case "QuoteMark":
            formatQuoteMark(builder, state, from, to, cursorPos, isReadonly)
            break

          case "Blockquote":
            formatBlockquote(builder, state, from, to, cursorPos, isReadonly)
            break

          // Lists
          case "TaskMarker":
            formatTaskMarker(builder, state, from, to, cursorPos, isReadonly)
            break

          case "ListMark":
            formatListMark(builder, state, from, to, cursorPos, isReadonly)
            break

          // Code
          case "CodeMark":
            formatCodeMark(builder, state, from, to, showRaw, isReadonly)
            break

          case "CodeInfo":
            formatCodeInfo(builder, state, from, to, showRaw, isReadonly)
            break

          case "HorizontalRule":
            formatHorizontalRule(builder, state, from, to, showRaw)
            break

          case "FencedCode":
            // formatd by codeSyntaxExtension
            break
        }
      } catch (err) {
        // Silently skip any decoration errors to prevent breaking the editor
        console.debug("Decoration error for", name, err)
      }
    },
  })

  return builder.finish()
}

/**
 * WYSIWYG View Plugin
 * Applies decorations to render markdown while typing
 */
const wysiwygPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = createWYSIWYGDecorations(view)
    }

    update(update: ViewUpdate) {
      // Recreate decorations on document or selection changes
      if (update.docChanged || update.selectionSet) {
        this.decorations = createWYSIWYGDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

/**
 * Export WYSIWYG extension
 * @param options - Configuration options
 * @param options.readonly - If true, always show WYSIWYG mode (ignore cursor position)
 */
export function createWYSIWYGExtension(options: {readonly?: boolean} = {}): Extension {
  const isReadonly = options.readonly ?? false

  return [readonlyMode.of(isReadonly), wysiwygPlugin]
}
