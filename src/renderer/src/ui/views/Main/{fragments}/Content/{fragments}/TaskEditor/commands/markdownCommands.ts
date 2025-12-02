import type {EditorView} from "@codemirror/view"

export type MarkdownCommand = (view: EditorView) => boolean

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
 * Insert block prefix (headings, lists, quotes, checkboxes)
 */
function insertBlockPrefix(prefix: string): MarkdownCommand {
  return (view: EditorView): boolean => {
    const {state} = view
    const line = state.doc.lineAt(state.selection.main.from)
    const lineText = line.text

    // Check if line already has prefix
    if (lineText.trim().startsWith(prefix.trim())) {
      // Remove prefix
      const prefixMatch = lineText.match(new RegExp(`^(\\s*)${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
      if (prefixMatch) {
        const prefixLen = prefixMatch[0].length
        view.dispatch({
          changes: {
            from: line.from,
            to: line.from + prefixLen,
          },
          selection: {anchor: line.from},
        })
      }
    } else {
      // Add prefix
      const indent = lineText.match(/^\s*/)?.[0] || ""
      view.dispatch({
        changes: {
          from: line.from,
          to: line.from + indent.length,
          insert: indent + prefix,
        },
        selection: {anchor: line.from + indent.length + prefix.length},
      })
    }

    view.focus()
    return true
  }
}

/**
 * Markdown Commands
 */
export const markdownCommands = {
  // Inline formatting
  toggleBold: toggleInlineMarker("**"),
  toggleItalic: toggleInlineMarker("*"),
  toggleCode: toggleInlineMarker("`"),
  toggleStrikethrough: toggleInlineMarker("~~"),

  // Headings
  insertHeading1: insertBlockPrefix("# "),
  insertHeading2: insertBlockPrefix("## "),
  insertHeading3: insertBlockPrefix("### "),
  insertHeading4: insertBlockPrefix("#### "),
  insertHeading5: insertBlockPrefix("##### "),
  insertHeading6: insertBlockPrefix("###### "),

  // Lists and quotes
  insertBulletList: insertBlockPrefix("- "),
  insertNumberedList: insertBlockPrefix("1. "),
  insertCheckbox: insertBlockPrefix("- [ ] "),
  insertBlockquote: insertBlockPrefix("> "),

  /**
   * Insert link
   */
  insertLink: (view: EditorView): boolean => {
    const {state} = view
    const {from, to} = state.selection.main
    const selectedText = state.doc.sliceString(from, to)

    // For now, insert template - in future, show dialog
    const linkText = selectedText || "link text"
    const markdown = `[${linkText}](url)`

    view.dispatch({
      changes: {from, to, insert: markdown},
      selection: selectedText
        ? {
            // Select "url" part if there was selected text
            anchor: from + markdown.length - 4,
            head: from + markdown.length - 1,
          }
        : {
            // Select "link text" if no selection
            anchor: from + 1,
            head: from + 1 + linkText.length,
          },
    })

    view.focus()
    return true
  },

  /**
   * Insert image
   * Returns command that needs async image upload
   */
  insertImage: (onImageUpload?: () => Promise<string>): ((view: EditorView) => Promise<boolean>) => {
    return async (view: EditorView): Promise<boolean> => {
      if (!onImageUpload) {
        const template = "![alt text](image-url)"
        const {from} = view.state.selection.main
        view.dispatch({
          changes: {from, insert: template},
          selection: {anchor: from + 2, head: from + 10}, // Select "alt text"
        })
        view.focus()
        return true
      }

      try {
        const markdown = await onImageUpload()
        if (markdown) {
          const {from} = view.state.selection.main
          view.dispatch({
            changes: {from, insert: markdown + "\n"},
            selection: {anchor: from + markdown.length + 1},
          })
          view.focus()
        }
        return true
      } catch (err) {
        console.error("Image upload failed:", err)
        return false
      }
    }
  },

  /**
   * Insert code block
   */
  insertCodeBlock: (view: EditorView): boolean => {
    const {from} = view.state.selection.main
    const template = "```\ncode here\n```"

    view.dispatch({
      changes: {from, insert: "\n" + template + "\n"},
      selection: {anchor: from + 4, head: from + 13}, // Select "code here"
    })

    view.focus()
    return true
  },

  /**
   * Insert table
   */
  insertTable: (view: EditorView): boolean => {
    const {from} = view.state.selection.main
    const template = `
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`.trim()

    view.dispatch({
      changes: {from, insert: "\n" + template + "\n"},
      selection: {anchor: from + 13}, // Position in first cell
    })

    view.focus()
    return true
  },

  /**
   * Clear formatting from selection
   */
  clearFormatting: (view: EditorView): boolean => {
    const {state} = view
    const {from, to} = state.selection.main

    if (from === to) return false

    let text = state.doc.sliceString(from, to)

    // Remove common markdown formatting
    text = text
      .replace(/\*\*(.+?)\*\*/g, "$1") // Bold
      .replace(/\*(.+?)\*/g, "$1") // Italic
      .replace(/__(.+?)__/g, "$1") // Bold (alt)
      .replace(/_(.+?)_/g, "$1") // Italic (alt)
      .replace(/`(.+?)`/g, "$1") // Inline code
      .replace(/~~(.+?)~~/g, "$1") // Strikethrough
      .replace(/\[(.+?)\]\(.+?\)/g, "$1") // Links

    view.dispatch({
      changes: {from, to, insert: text},
      selection: {anchor: from, head: from + text.length},
    })

    view.focus()
    return true
  },

  /**
   * Insert horizontal rule
   */
  insertHorizontalRule: (view: EditorView): boolean => {
    const {from} = view.state.selection.main
    const line = view.state.doc.lineAt(from)

    view.dispatch({
      changes: {from: line.to, insert: "\n\n---\n\n"},
      selection: {anchor: line.to + 7},
    })

    view.focus()
    return true
  },
}

/**
 * Create keyboard shortcuts keymap
 */
export function createMarkdownKeymap() {
  return [
    // Text formatting
    {key: "Mod-b", run: markdownCommands.toggleBold},
    {key: "Mod-i", run: markdownCommands.toggleItalic},
    {key: "Mod-`", run: markdownCommands.toggleCode},
    {key: "Mod-Shift-x", run: markdownCommands.toggleStrikethrough},
    {key: "Mod-k", run: markdownCommands.insertLink},
  ]
}
