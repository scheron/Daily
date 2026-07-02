import type {EditorState} from "@codemirror/state"
import type {Command} from "@codemirror/view"

const OPENING_FENCE_RE = /^(\s*)(`{3,}|~{3,})([A-Za-z][\w+#.-]*)\s*$/

/**
 * Plan an auto-close edit for a code fence, or `null` when it doesn't apply.
 *
 * Fires when the caret is at the end of an opening fence line (e.g. ```` ```ts ````)
 * that has no matching closing fence below it — so newly opened code blocks are
 * always terminated instead of swallowing the rest of the document. The returned
 * text adds an empty body line plus the closing fence, and the anchor lands the
 * caret on that empty line. Requiring a language keeps closing fences (which never
 * carry one) from being mistaken for openings.
 *
 * @param state - The editor state
 * @example planFenceAutoClose(state) // → {insert: "\n\n```", anchor: 6} | null
 */
export function planFenceAutoClose(state: EditorState): {insert: string; anchor: number} | null {
  const selection = state.selection.main
  if (!selection.empty) return null

  const line = state.doc.lineAt(selection.head)
  if (selection.head !== line.to) return null

  const match = line.text.match(OPENING_FENCE_RE)
  if (!match) return null

  const [, indent, fence] = match
  const closingFence = new RegExp(`^\\s*[${fence[0]}]{${fence.length},}\\s*$`)
  for (let lineNumber = line.number + 1; lineNumber <= state.doc.lines; lineNumber++) {
    if (closingFence.test(state.doc.line(lineNumber).text)) return null
  }

  const insert = `\n\n${indent}${fence}`
  return {insert, anchor: selection.head + 1}
}

/**
 * Enter command: closes a freshly opened code fence and drops the caret onto the
 * empty body line. Returns `false` (so the default newline runs) otherwise.
 */
export const closeCodeFenceOnEnter: Command = (view) => {
  const plan = planFenceAutoClose(view.state)
  if (!plan) return false

  view.dispatch({
    changes: {from: view.state.selection.main.head, insert: plan.insert},
    selection: {anchor: plan.anchor},
    scrollIntoView: true,
  })
  return true
}
