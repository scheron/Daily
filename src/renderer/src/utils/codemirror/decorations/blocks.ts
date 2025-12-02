import {Decoration} from "@codemirror/view"

import type {EditorState, RangeSetBuilder} from "@codemirror/state"

const HEADING_FONT_SIZES = ["1.5em", "1.35em", "1.3em", "1.25em", "1.125em", "1em"]
const HEADING_LINE_HEIGHTS = ["1.4", "1.2", "1.1", "1", "1", "1"]

/**
 * format headings (# through ######)
 */
export function formatHeading(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  level: number,
  showRaw: boolean,
): void {
  if (showRaw) return

  const text = state.doc.sliceString(from, to)
  const hashMatch = text.match(/^#{1,6}\s/)

  if (hashMatch) {
    const hashLen = hashMatch[0].length

    // Hide the hash marks
    builder.add(from, from + hashLen, Decoration.replace({}))

    // Style the heading content with exact markdown.css sizes
    builder.add(
      from + hashLen,
      to,
      Decoration.mark({
        class: `cm-heading cm-heading${level}`,
        attributes: {
          style: `font-weight: 600; font-size: ${HEADING_FONT_SIZES[level - 1]}; line-height: ${HEADING_LINE_HEIGHTS[level - 1]}; text-decoration: none; border-bottom: none;`,
        },
      }),
    )
  }
}

/**
 * format blockquote marker (>)
 */
export function formatQuoteMark(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  cursorPos: number,
  isReadonly: boolean,
): void {
  // Check if cursor is on the same line
  const quoteLine = state.doc.lineAt(from)
  const cursorLine = state.doc.lineAt(cursorPos)
  const cursorOnSameLine = !isReadonly && quoteLine.number === cursorLine.number

  if (!cursorOnSameLine) {
    // Hide the > marker completely using CSS
    builder.add(
      from,
      to,
      Decoration.mark({
        class: "cm-marker-hidden",
      }),
    )
  }
}

/**
 * format blockquote content styling
 */
export function formatBlockquote(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  cursorPos: number,
  isReadonly: boolean,
): void {
  // Check if cursor is on the same line
  const quoteLine = state.doc.lineAt(from)
  const cursorLine = state.doc.lineAt(cursorPos)
  const cursorOnSameLine = !isReadonly && quoteLine.number === cursorLine.number

  if (!cursorOnSameLine) {
    builder.add(
      from,
      to,
      Decoration.mark({
        class: "cm-quote",
      }),
    )
  }
}

/**
 * format horizontal rule (---, ***, ___)
 */
export function formatHorizontalRule(builder: RangeSetBuilder<Decoration>, state: EditorState, from: number, to: number, showRaw: boolean): void {
  if (showRaw) return

  builder.add(
    from,
    to,
    Decoration.mark({
      class: "cm-hr",
    }),
  )
}
