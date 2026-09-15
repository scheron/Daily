import type {Command, EditorView} from "@codemirror/view"

export const inlineCommands = {
  toggleBold: toggleInlineMarker("**"),
  toggleItalic: toggleInlineMarker("*"),
  toggleCode: toggleInlineMarker("`"),
  toggleStrikethrough: toggleInlineMarker("~~"),
  clearFormatting,
}

function toggleInlineMarker(marker: string): Command {
  return (view: EditorView): boolean => {
    const {state} = view
    const {from, to} = state.selection.main

    if (from === to) {
      view.dispatch({
        changes: {from, insert: marker + marker},
        selection: {anchor: from + marker.length},
      })
    } else {
      const markerLen = marker.length
      const before = state.doc.sliceString(Math.max(0, from - markerLen), from)
      const after = state.doc.sliceString(to, Math.min(state.doc.length, to + markerLen))
      const selectedText = state.doc.sliceString(from, to)

      if (before === marker && after === marker) {
        view.dispatch({
          changes: [
            {from: from - markerLen, to: from},
            {from: to, to: to + markerLen},
          ],
          selection: {anchor: from - markerLen, head: to - markerLen},
        })
      } else {
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

function clearFormatting(view: EditorView): boolean {
  const {state} = view
  const {from, to} = state.selection.main
  if (from === to) {
    view.focus()
    return false
  }

  const changes: {from: number; to: number; insert?: string}[] = []
  let left = from
  let right = to

  for (;;) {
    const marker = ["**", "__", "~~", "*", "_", "`"].find((candidate) => {
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

  if (changes.length === 0) {
    view.focus()
    return false
  }

  changes.sort((a, b) => a.from - b.from)
  view.dispatch({changes, selection: {anchor: left, head: left + inner.length}})
  view.focus()
  return true
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
}
