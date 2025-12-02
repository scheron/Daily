import {Extension} from "@codemirror/state"
import {Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType} from "@codemirror/view"
import {syntaxTree} from "@codemirror/language"
import {RangeSetBuilder} from "@codemirror/state"

/**
 * Check if cursor is inside or touching a range
 */
function isCursorInRange(cursorPos: number, from: number, to: number): boolean {
  return cursorPos >= from && cursorPos <= to
}

/**
 * Widget for rendering checkboxes in task lists
 */
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }

  toDOM() {
    const wrapper = document.createElement("span")
    wrapper.className = "cm-task-marker"

    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = this.checked
    checkbox.className = "markdown-checkbox"
    checkbox.style.marginRight = "0.5rem"
    checkbox.style.cursor = "pointer"

    // Prevent checkbox interaction (view-only in WYSIWYG)
    checkbox.onclick = (e) => {
      e.preventDefault()
    }

    wrapper.appendChild(checkbox)
    return wrapper
  }

  ignoreEvent() {
    return false
  }
}

/**
 * Create WYSIWYG decorations for markdown content
 */
function createWYSIWYGDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const {state} = view
  const tree = syntaxTree(state)
  const cursorPos = state.selection.main.head

  // Iterate through syntax tree
  tree.iterate({
    enter: (node) => {
      const {from, to, name} = node

      // Skip if cursor is inside this element (show raw syntax)
      const showRaw = isCursorInRange(cursorPos, from, to)

      try {
        // Handle different markdown elements
        switch (name) {
          // === Inline Elements ===

          case "StrongEmphasis": {
            // Bold: **text** or __text__
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

          case "Emphasis": {
            // Italic: *text* or _text_
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

          case "InlineCode": {
            // Inline code: `code`
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

          case "Strikethrough": {
            // Strikethrough: ~~text~~
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

          // === Block Elements ===

          case "ATXHeading1":
          case "ATXHeading2":
          case "ATXHeading3":
          case "ATXHeading4":
          case "ATXHeading5":
          case "ATXHeading6": {
            // Headings: # text
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
                      style: `font-weight: 600; font-size: ${fontSizes[level - 1]}; line-height: ${lineHeights[level - 1]};`,
                    },
                  }),
                )
              }
            }
            break
          }

          case "QuoteMark": {
            // Blockquote marker: >
            if (!showRaw) {
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

          case "Blockquote": {
            // Blockquote content styling
            if (!showRaw) {
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

          case "TaskMarker": {
            // Task list checkbox: [ ] or [x]
            const text = state.doc.sliceString(from, to)
            const checked = /\[x\]/i.test(text)

            if (!showRaw) {
              // Replace marker with checkbox widget
              builder.add(from, to, Decoration.replace({widget: new CheckboxWidget(checked)}))
            }
            break
          }

          case "ListMark": {
            // List markers: - or * or +
            if (!showRaw) {
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

          case "Link": {
            // Links: [text](url)
            if (!showRaw) {
              // Parse link text and URL
              const text = state.doc.sliceString(from, to)
              const match = text.match(/\[([^\]]+)\]\(([^)]+)\)/)

              if (match) {
                const linkTextLen = match[1].length
                const urlLen = match[2].length

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

          case "Image": {
            // Images: ![alt](url)
            if (!showRaw) {
              const text = state.doc.sliceString(from, to)
              const match = text.match(/!\[([^\]]*)\]\(([^)]+)\)/)

              if (match) {
                const altText = match[1] || "image"

                // Show simplified text instead of full markdown
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
            break
          }

          case "HorizontalRule": {
            // Horizontal rule: --- or *** or ___
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

          case "CodeMark": {
            // Code fence markers: ```
            if (!showRaw) {
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

          case "FencedCode": {
            // Code blocks: ```lang\ncode\n```
            if (!showRaw) {
              builder.add(
                from,
                to,
                Decoration.mark({
                  class: "cm-codeblock",
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
 */
export function createWYSIWYGExtension(): Extension {
  return [wysiwygPlugin]
}
