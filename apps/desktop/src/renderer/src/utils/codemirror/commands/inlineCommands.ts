import type {ChangeSpec, EditorState} from "@codemirror/state"
import type {EditorView} from "@codemirror/view"
import type {MarkdownCommand} from "../types"

/** Symmetric inline markers, longest first so `**`/`__`/`~~` win over `*`/`_`. */
const SURROUND_MARKERS = ["**", "__", "~~", "*", "_", "`"]

/**
 * Inline formatting commands
 */
export const inlineCommands = {
  toggleBold: toggleInlineMarker("**"),
  toggleItalic: toggleInlineMarker("*"),
  toggleCode: toggleInlineMarker("`"),
  toggleStrikethrough: toggleInlineMarker("~~"),
  clearFormatting,
}

/**
 * Plan the edits for clearing formatting on the current selection, or `null`
 * when there is nothing to clear.
 *
 * Removes symmetric markers that wrap the selection (so selecting just `hello`
 * inside `*hello*` still clears it) layer by layer, and strips any inline
 * markdown left inside the selection.
 *
 * @param state - The editor state
 * @example planClearFormatting(state) // → {changes, anchor, head} | null
 */
export function planClearFormatting(state: EditorState): {changes: ChangeSpec[]; anchor: number; head: number} | null {
  const {from, to} = state.selection.main
  if (from === to) return null

  const changes: {from: number; to: number; insert?: string}[] = []
  let left = from
  let right = to

  for (;;) {
    const marker = SURROUND_MARKERS.find((candidate) => {
      const len = candidate.length
      return (
        left - len >= 0 &&
        right + len <= state.doc.length &&
        state.doc.sliceString(left - len, left) === candidate &&
        state.doc.sliceString(right, right + len) === candidate
      )
    })
    if (!marker) break

    const len = marker.length
    changes.push({from: left - len, to: left}, {from: right, to: right + len})
    left -= len
    right += len
  }

  const original = state.doc.sliceString(from, to)
  const inner = stripInlineMarkdown(original)
  if (inner !== original) changes.push({from, to, insert: inner})

  if (changes.length === 0) return null

  changes.sort((a, b) => a.from - b.from)
  return {changes, anchor: left, head: left + inner.length}
}

/**
 * Toggle inline marker (bold, italic, code, strikethrough)
 */
function toggleInlineMarker(marker: string): MarkdownCommand {
  return (view: EditorView): boolean => {
    const {state} = view
    const {from, to} = state.selection.main

    if (from === to) {
      // No selection: insert markers and place cursor between them
      view.dispatch({
        changes: {from, insert: marker + marker},
        selection: {anchor: from + marker.length},
      })
    } else {
      // Has selection: check if already wrapped
      const markerLen = marker.length
      const before = state.doc.sliceString(Math.max(0, from - markerLen), from)
      const after = state.doc.sliceString(to, Math.min(state.doc.length, to + markerLen))
      const selectedText = state.doc.sliceString(from, to)

      if (before === marker && after === marker) {
        // Remove markers
        view.dispatch({
          changes: [
            {from: from - markerLen, to: from},
            {from: to, to: to + markerLen},
          ],
          selection: {anchor: from - markerLen, head: to - markerLen},
        })
      } else {
        // Add markers
        view.dispatch({
          changes: {from, to, insert: `${marker}${selectedText}${marker}`},
          selection: {anchor: from, head: to + markerLen * 2},
        })
      }
    }

    view.focus()
    return true
  }
}

/**
 * Clear formatting from the selection — both wrapping markers and inline markup.
 */
function clearFormatting(view: EditorView): boolean {
  const plan = planClearFormatting(view.state)
  if (!plan) {
    view.focus()
    return false
  }

  view.dispatch({changes: plan.changes, selection: {anchor: plan.anchor, head: plan.head}})
  view.focus()
  return true
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // Bold
    .replace(/\*(.+?)\*/g, "$1") // Italic
    .replace(/__(.+?)__/g, "$1") // Bold (alt)
    .replace(/_(.+?)_/g, "$1") // Italic (alt)
    .replace(/`(.+?)`/g, "$1") // Inline code
    .replace(/~~(.+?)~~/g, "$1") // Strikethrough
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // Links
}
