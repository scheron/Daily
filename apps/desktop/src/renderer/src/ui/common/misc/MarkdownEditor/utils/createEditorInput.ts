import {Fragment} from "@tiptap/pm/model"
import {TextSelection} from "@tiptap/pm/state"

import type {Editor} from "@tiptap/core"
import type {EditorProps} from "@tiptap/pm/view"
import type {Ref} from "vue"

const pairs = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ['"', '"'],
  ["'", "'"],
  ["_", "_"],
])
export function createEditorInput(editor: Readonly<Ref<Editor | null>>): EditorProps {
  const closing = new Set(pairs.values())

  return {
    handleTextInput(view, from, to, text) {
      if (!view.editable || view.composing || text.length !== 1) return false

      const {$from} = view.state.selection
      const at = $from.parentOffset
      const before = $from.parent.textBetween(0, at, "\n", "\ufffc")
      const after = $from.parent.textBetween(at, Math.min(at + 1, $from.parent.content.size), "\n", "\ufffc")
      const code = $from.parent.type.spec.code || $from.marks().some(({type}) => type.name === "code")
      const {tr} = view.state

      if (from === to && after === text && closing.has(text)) {
        const italic = text === "_" && !code ? before.match(/(?:^|[^\w_])_([^_\n]+)$/) : null
        if (italic) {
          const start = from - italic[1].length - 1
          tr.delete(to, to + 1)
            .delete(start, start + 1)
            .addMark(start, from - 1, view.state.schema.marks.italic.create())
          tr.setSelection(TextSelection.create(tr.doc, from - 1)).removeStoredMark(view.state.schema.marks.italic)
        } else {
          tr.setSelection(TextSelection.create(tr.doc, from + 1))
        }
        view.dispatch(tr)
        return true
      }

      const close = pairs.get(text)
      if (!close) return false
      if (from !== to) {
        if (!view.state.selection.$to.sameParent($from)) return false
        tr.insertText(close, to).insertText(text, from)
        tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1))
      } else {
        if (!code && text === "(" && before.endsWith("]")) return false
        if (/[\w]/u.test(after) || (/['"_]/.test(text) && /[\p{L}\p{N}]$/u.test(before))) return false
        tr.insertText(text + close, from)
        tr.setSelection(TextSelection.create(tr.doc, from + 1))
      }
      view.dispatch(tr)
      return true
    },
    handleKeyDown(view, event) {
      if (!view.editable || view.composing) return false

      if (event.key === "`" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        return editor.value?.commands.toggleCode() ?? false
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false

      const {selection, tr} = view.state
      const {$from} = selection
      if (!selection.empty || !$from.parent.isTextblock) return false

      const at = $from.parentOffset
      if (event.key === "Backspace" && at > 0 && at < $from.parent.content.size) {
        const previous = $from.parent.textBetween(at - 1, at)
        const next = $from.parent.textBetween(at, at + 1)
        if (pairs.get(previous) !== next) return false
        view.dispatch(tr.delete($from.pos - 1, $from.pos + 1))
        return true
      }

      if (event.key !== "Enter" || at !== $from.parent.content.size || $from.parent.type.name !== "paragraph") return false

      const text = $from.parent.textBetween(0, at, "\n", "\n")
      const match = text.match(/(^|\n)[ \t]*(?:`{3,}|~{3,})([A-Za-z][\w+#.-]*)?[ \t]*$/)
      if (!match) return false

      const block = view.state.schema.nodes.codeBlock.create({language: match[2] || null})
      const parent = $from.node(-1)
      const index = $from.index(-1)
      const before = $from.parent.content.cut(0, match.index ?? 0)
      const keepParagraph = before.size > 0 || !parent.canReplaceWith(index, index + 1, block.type)
      const prefix = keepParagraph ? $from.parent.copy(before) : null
      const replacement = Fragment.fromArray(prefix ? [prefix, block] : [block])
      if (!parent.canReplace(index, index + 1, replacement)) return false

      const start = $from.before()
      tr.replaceWith(start, $from.after(), replacement)
      tr.setSelection(TextSelection.create(tr.doc, start + (prefix?.nodeSize ?? 0) + 1))
      view.dispatch(tr.scrollIntoView())
      return true
    },
  }
}
