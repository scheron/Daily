import {CheckboxWidget} from "@/utils/codemirror/widgets/CheckboxWidget"

import {Decoration} from "@codemirror/view"

import type {EditorState, RangeSetBuilder} from "@codemirror/state"

/**
 * format task markers ([ ] or [x])
 * Show widget when cursor is on a different line, show raw when cursor is on same line
 */
export function formatTaskMarker(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  cursorPos: number,
  isReadonly: boolean,
): void {
  // Check if cursor is on the same line as the checkbox
  const checkboxLine = state.doc.lineAt(from)
  const cursorLine = state.doc.lineAt(cursorPos)
  const cursorOnSameLine = !isReadonly && checkboxLine.number === cursorLine.number

  if (!cursorOnSameLine) {
    const text = state.doc.sliceString(from, to)
    const checked = /\[x\]/i.test(text)

    // Insert checkbox widget before the marker
    builder.add(
      from,
      from,
      Decoration.widget({
        widget: new CheckboxWidget(checked, from, isReadonly),
        side: -1,
      }),
    )

    // Hide the text marker [ ] or [x]
    builder.add(from, to, Decoration.replace({}))
  }
}

/**
 * format list markers (-, *, +)
 */
export function formatListMark(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  cursorPos: number,
  isReadonly: boolean,
): void {
  // Check if cursor is on the same line
  const listLine = state.doc.lineAt(from)
  const cursorLine = state.doc.lineAt(cursorPos)
  const cursorOnSameLine = !isReadonly && listLine.number === cursorLine.number

  if (!cursorOnSameLine) {
    builder.add(
      from,
      to,
      Decoration.mark({
        class: "cm-marker-subtle",
      }),
    )
  }
}
