import type {StyleSpec} from "@/utils/codemirror/types"

/**
 * Base editor styles
 * - Root editor container
 * - Content area
 * - Cursor and selection
 * - Focus states
 * - Gutters
 */
export const editorStyles: Record<string, StyleSpec> = {
  "&": {
    color: "var(--color-base-content)",
    backgroundColor: "transparent",
    fontFamily: "var(--font-sans)",
    fontSize: "0.875rem", // 14px - smaller than default
    height: "100%",
    lineHeight: "1.6",
  },

  ".cm-content": {
    caretColor: "var(--color-accent)",
    padding: "1rem",
    fontFamily: "inherit",
    fontSize: "0.875rem", // 14px - match root
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
  },

  ".cm-line": {
    padding: "0",
  },

  ".cm-placeholder": {
    color: "var(--color-base-content)",
    opacity: "0.4",
  },

  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-accent)",
    borderLeftWidth: "2px",
    marginLeft: "-1px",
  },

  "&.cm-focused": {
    outline: "none",
  },

  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "var(--color-editor-selection) !important",
  },

  ".cm-selectionBackground": {
    background: "var(--color-editor-selection) !important",
  },

  "& ::selection, &::selection": {
    backgroundColor: "var(--color-editor-selection)",
    color: "var(--color-base-content)",
  },

  ".cm-activeLine": {
    backgroundColor: "transparent",
  },

  ".cm-gutters": {
    display: "none",
  },
}
