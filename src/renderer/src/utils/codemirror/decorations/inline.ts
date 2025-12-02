import {ImageWidget} from "@/utils/codemirror/widgets/ImageWidget"

import {Decoration} from "@codemirror/view"

import type {EditorState, RangeSetBuilder} from "@codemirror/state"

/**
 * format bold/strong emphasis (**text** or __text__)
 */
export function formatStrongEmphasis(builder: RangeSetBuilder<Decoration>, state: EditorState, from: number, to: number, showRaw: boolean): void {
  if (showRaw) return

  const text = state.doc.sliceString(from, to)
  const marker = text.startsWith("**") ? "**" : "__"
  const markerLen = marker.length

  // Hide opening marker
  builder.add(from, from + markerLen, Decoration.replace({}))

  // Style the content
  builder.add(
    from + markerLen,
    to - markerLen,
    Decoration.mark({
      class: "cm-strong",
      attributes: {style: "font-weight: 600;"},
    }),
  )

  // Hide closing marker
  builder.add(to - markerLen, to, Decoration.replace({}))
}

/**
 * format italic/emphasis (*text* or _text_)
 */
export function formatEmphasis(builder: RangeSetBuilder<Decoration>, state: EditorState, from: number, to: number, showRaw: boolean): void {
  if (showRaw) return

  const text = state.doc.sliceString(from, to)
  const marker = text.startsWith("*") ? "*" : "_"
  const markerLen = marker.length

  // Hide opening marker
  builder.add(from, from + markerLen, Decoration.replace({}))

  // Style the content
  builder.add(
    from + markerLen,
    to - markerLen,
    Decoration.mark({
      class: "cm-emphasis",
      attributes: {style: "font-style: italic;"},
    }),
  )

  // Hide closing marker
  builder.add(to - markerLen, to, Decoration.replace({}))
}

/**
 * format inline code (`code`)
 */
export function formatInlineCode(builder: RangeSetBuilder<Decoration>, state: EditorState, from: number, to: number, showRaw: boolean): void {
  if (showRaw) return

  // Hide opening backtick
  builder.add(from, from + 1, Decoration.replace({}))

  // Style the content
  builder.add(
    from + 1,
    to - 1,
    Decoration.mark({
      class: "cm-code",
    }),
  )

  // Hide closing backtick
  builder.add(to - 1, to, Decoration.replace({}))
}

/**
 * format strikethrough (~~text~~)
 */
export function formatStrikethrough(builder: RangeSetBuilder<Decoration>, state: EditorState, from: number, to: number, showRaw: boolean): void {
  if (showRaw) return

  // Hide opening ~~
  builder.add(from, from + 2, Decoration.replace({}))

  // Style the content
  builder.add(
    from + 2,
    to - 2,
    Decoration.mark({
      attributes: {style: "text-decoration: line-through;"},
    }),
  )

  // Hide closing ~~
  builder.add(to - 2, to, Decoration.replace({}))
}

/**
 * format links ([text](url))
 */
export function formatLink(builder: RangeSetBuilder<Decoration>, state: EditorState, from: number, to: number, showRaw: boolean): void {
  if (showRaw) return

  // Parse link text and URL
  const text = state.doc.sliceString(from, to)
  const match = text.match(/\[([^\]]+)\]\(([^)]+)\)/)

  if (match) {
    const linkTextLen = match[1].length

    // Hide opening [
    builder.add(from, from + 1, Decoration.replace({}))

    // Style link text to match markdown.css
    builder.add(
      from + 1,
      from + 1 + linkTextLen,
      Decoration.mark({
        class: "cm-link",
        attributes: {
          style: "color: var(--color-info); text-decoration: none;",
        },
      }),
    )

    // Hide ](url)
    builder.add(from + 1 + linkTextLen, to, Decoration.replace({}))
  }
}

/**
 * format images (![alt](url) or ![alt =WxH](url))
 */
export function formatImage(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  from: number,
  to: number,
  showRaw: boolean,
  isReadonly: boolean,
): void {
  if (showRaw) return

  const text = state.doc.sliceString(from, to)
  // Match both plain and dimensioned image syntax
  const match = text.match(/!\[([^\]]*?)\s*(?:=(\d+)x(\d+))?\]\(([^)]+)\)/)

  if (match) {
    if (isReadonly) {
      // In readonly mode, replace with actual image widget
      const alt = match[1] || "image"
      const width = match[2] ? parseInt(match[2]) : undefined
      const height = match[3] ? parseInt(match[3]) : undefined
      const url = match[4]

      // Replace entire markdown with image widget
      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new ImageWidget(url, alt, width, height),
        }),
      )
    } else {
      // In edit mode, show simplified styled text
      builder.add(
        from,
        to,
        Decoration.mark({
          attributes: {
            style: "color: var(--color-accent); font-style: italic;",
          },
        }),
      )
    }
  }
}
