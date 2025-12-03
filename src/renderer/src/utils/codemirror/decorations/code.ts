import {Decoration} from "@codemirror/view"

import type {EditorState, RangeSetBuilder} from "@codemirror/state"

/**
 * format code fence markers (```)
 */
export function formatCodeMark(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  showRaw: boolean,
  isReadonly: boolean,
): void {
  if (showRaw) return

  if (isReadonly) {
    // In readonly mode, hide the entire line
    const line = state.doc.lineAt(from)
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: "cm-hide-line",
      }),
    )
  } else {
    // In edit mode, make markers subtle
    builder.add(
      from,
      to,
      Decoration.mark({
        class: "cm-marker-subtle",
      }),
    )
  }
}

/**
 * format code info (language name after opening ```)
 */
export function formatCodeInfo(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  showRaw: boolean,
  isReadonly: boolean,
): void {
  if (showRaw || isReadonly) return

  // Only show in edit mode
  builder.add(
    from,
    to,
    Decoration.mark({
      class: "cm-code-lang",
      attributes: {
        style: "color: var(--color-accent); font-size: 0.75em; opacity: 0.7;",
      },
    }),
  )
}
