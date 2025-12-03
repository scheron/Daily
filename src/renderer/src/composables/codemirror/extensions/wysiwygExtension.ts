import {syntaxTree} from "@codemirror/language"
import {Facet, RangeSetBuilder} from "@codemirror/state"
import {Decoration, ViewPlugin, WidgetType} from "@codemirror/view"

import type {Extension} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"

/**
 * Facet for storing readonly mode state
 * Exported for use in other extensions (e.g., codeSyntaxExtension)
 */
export const readonlyMode = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
})

/**
 * Check if cursor is inside or touching a range
 */
function isCursorInRange(cursorPos: number, from: number, to: number): boolean {
  return cursorPos >= from && cursorPos <= to
}

function isSelectionOverlapping(selectionFrom: number, selectionTo: number, from: number, to: number): boolean {
  return selectionFrom < to && selectionTo > from
}

/**
 * Widget for rendering checkboxes in task lists
 */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
    readonly isReadonly: boolean,
  ) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span")
    wrapper.className = "cm-task-marker"
    wrapper.style.display = "inline-flex"
    wrapper.style.alignItems = "center"
    wrapper.style.marginRight = "0.5rem"
    wrapper.style.verticalAlign = "middle"
    wrapper.style.lineHeight = "1.8" // Ensure consistent line height

    // Apply readonly styles to wrapper
    if (this.isReadonly) {
      wrapper.style.cursor = "default"
      wrapper.style.pointerEvents = "none" // Prevent any interaction
    } else {
      wrapper.style.cursor = "pointer"
    }

    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = this.checked

    // Apply CSS classes from theme (checkmark is created via ::after pseudo-element)
    checkbox.className = this.checked ? "cm-task-checkbox cm-task-checkbox-checked" : "cm-task-checkbox"

    // Only add click handler in edit mode
    if (!this.isReadonly) {
      checkbox.onclick = (e) => {
        e.preventDefault()
        this.toggleCheckbox(view)
        return false
      }
    }

    wrapper.appendChild(checkbox)
    return wrapper
  }

  toggleCheckbox(view: EditorView) {
    // Find the task marker text ([ ] or [x])
    const text = view.state.doc.sliceString(this.pos, this.pos + 3)

    if (text === "[ ]" || text === "[x]" || text === "[X]") {
      const newText = this.checked ? "[ ]" : "[x]"

      // Save current cursor position
      const currentSelection = view.state.selection.main

      view.dispatch({
        changes: {
          from: this.pos,
          to: this.pos + 3,
          insert: newText,
        },
        // Preserve cursor position
        selection: {anchor: currentSelection.anchor, head: currentSelection.head},
      })
    }
  }

  ignoreEvent() {
    return false
  }
}

/**
 * Widget for rendering images in readonly mode
 */
class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly width?: number,
    readonly height?: number,
  ) {
    super()
  }

  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt && other.width === this.width && other.height === this.height
  }

  toDOM() {
    const wrapper = document.createElement("span")
    wrapper.className = "cm-image-wrapper"
    wrapper.style.display = "inline-block"
    wrapper.style.maxWidth = "100%"
    wrapper.style.margin = "0.5rem 0"

    const img = document.createElement("img")
    img.src = this.url
    img.alt = this.alt
    img.style.maxWidth = "100%"
    img.style.height = "auto"
    img.style.display = "block"
    img.style.borderRadius = "0.375rem" // rounded-md

    // Apply specific dimensions if provided
    if (this.width) {
      img.style.width = `${this.width}px`
    }
    if (this.height) {
      img.style.height = `${this.height}px`
    }

    // Handle image load errors
    img.onerror = () => {
      wrapper.innerHTML = `<span style="color: var(--color-error); font-style: italic;">Failed to load image: ${this.alt}</span>`
    }

    wrapper.appendChild(img)
    return wrapper
  }

  ignoreEvent() {
    return true
  }
}

/**
 * Create WYSIWYG decorations for markdown content
 */
function createWYSIWYGDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const {state} = view
  const tree = syntaxTree(state)
  const selection = state.selection.main
  const cursorPos = selection.head
  const hasSelection = selection.from !== selection.to
  const isReadonly = state.facet(readonlyMode)

  // Iterate through syntax tree
  tree.iterate({
    enter: (node) => {
      const {from, to, name} = node

      // Show raw syntax when:
      // 1. Not in readonly mode
      // 2. Either cursor is inside the element OR selection overlaps with the element
      const showRaw =
        !isReadonly && (isCursorInRange(cursorPos, from, to) || (hasSelection && isSelectionOverlapping(selection.from, selection.to, from, to)))

      try {
        // Handle different markdown elements
        switch (name) {
          // Bold: **text** or __text__
          case "StrongEmphasis": {
            if (!showRaw) {
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
            break
          }

          // Italic: *text* or _text_
          case "Emphasis": {
            if (!showRaw) {
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
            break
          }

          // Inline code: `code`
          case "InlineCode": {
            if (!showRaw) {
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
            break
          }

          // Strikethrough: ~~text~~
          case "Strikethrough": {
            if (!showRaw) {
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
            break
          }

          // Headings: # text
          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6": {
            if (!showRaw) {
              const level = parseInt(name.slice(-1))
              const text = state.doc.sliceString(from, to)
              const hashMatch = text.match(/^#{1,6}\s/)

              if (hashMatch) {
                const hashLen = hashMatch[0].length

                // Hide the hash marks
                builder.add(from, from + hashLen, Decoration.replace({}))

                // Style the heading content with exact markdown.css sizes
                const fontSizes = ["1.5em", "1.35em", "1.3em", "1.25em", "1.125em", "1em"]
                const lineHeights = ["1.4", "1.2", "1.1", "1", "1", "1"]
                builder.add(
                  from + hashLen,
                  to,
                  Decoration.mark({
                    class: `cm-heading cm-heading${level}`,
                    attributes: {
                      style: `font-weight: 600; font-size: ${fontSizes[level - 1]}; line-height: ${lineHeights[level - 1]}; text-decoration: none; border-bottom: none;`,
                    },
                  }),
                )
              }
            }
            break
          }

          // Blockquote marker: >
          case "QuoteMark": {
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
            break
          }

          // Blockquote content styling
          case "Blockquote": {
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
            break
          }

          // Task list checkbox: [ ] or [x]
          // Show widget when cursor is on a different line, show raw when cursor is on same line
          case "TaskMarker": {
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
            break
          }

          // List markers: - or * or +
          case "ListMark": {
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
            break
          }

          // Links: [text](url)
          case "Link": {
            if (!showRaw) {
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
            break
          }

          // Images: ![alt](url) or ![alt =WIDTHxHEIGHT](url)
          case "Image": {
            if (!showRaw) {
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
            break
          }

          // Horizontal rule: --- or *** or ___
          case "HorizontalRule": {
            console.log("HorizontalRule", from, to)
            if (!showRaw) {
              builder.add(
                from,
                to,
                Decoration.mark({
                  class: "cm-hr",
                }),
              )
            }
            break
          }

          // Code fence markers: ```
          case "CodeMark": {
            if (!showRaw) {
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
            break
          }

          // Code blocks: ```lang\ncode\n```
          case "FencedCode": {
            // Let codeSyntaxExtension handle the styling
            // We just need to ensure we don't interfere
            break
          }

          // Code info (language name after opening ```)
          case "CodeInfo": {
            if (!showRaw && !isReadonly) {
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
            break
          }
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

  return [
    // Set readonly mode facet first
    readonlyMode.of(isReadonly),
    // Then apply plugin
    wysiwygPlugin,
  ]
}
