import {EditorView} from "@codemirror/view"
import {Extension} from "@codemirror/state"

/**
 * Custom CodeMirror theme that matches Daily's design system
 * Uses CSS variables for theme integration and supports dark/light modes
 */
export function createThemeExtension(): Extension {
  return EditorView.theme(
    {
      "&": {
        color: "var(--color-base-content)",
        backgroundColor: "transparent",
        fontFamily: "var(--font-sans)",
        fontSize: "inherit",
        height: "100%",
      },

      ".cm-content": {
        caretColor: "var(--color-accent)",
        padding: "1rem",
        fontFamily: "inherit",
      },

      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-accent)",
        borderLeftWidth: "2px",
      },

      "&.cm-focused": {
        outline: "none",
      },

      "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--color-accent)",
        opacity: "0.2",
      },

      ".cm-selectionBackground": {
        backgroundColor: "var(--color-accent)",
        opacity: "0.15",
      },

      ".cm-activeLine": {
        backgroundColor: "transparent",
      },

      ".cm-gutters": {
        display: "none", // No line numbers for clean look
      },

      // Markdown-specific styling
      ".cm-strong": {
        fontWeight: "600",
        color: "var(--color-base-content)",
      },

      ".cm-emphasis": {
        fontStyle: "italic",
        color: "var(--color-base-content)",
      },

      ".cm-code": {
        fontFamily: "var(--font-mono)",
        backgroundColor: "var(--color-base-300)",
        padding: "0.2em 0.4em",
        borderRadius: "6px",
        fontSize: "85%",
        lineHeight: "1.5",
      },

      ".cm-link": {
        color: "var(--color-info)",
        textDecoration: "none",
        cursor: "pointer",
      },

      ".cm-link:hover": {
        textDecoration: "underline",
      },

      ".cm-heading": {
        fontWeight: "600",
        color: "var(--color-base-content)",
      },

      ".cm-heading1": {
        fontSize: "1.5em",
        lineHeight: "1.4",
        margin: "0.6em 0",
        paddingBottom: "0.1em",
      },

      ".cm-heading2": {
        fontSize: "1.35em",
        lineHeight: "1.2",
      },

      ".cm-heading3": {
        fontSize: "1.3em",
        lineHeight: "1.1",
      },

      ".cm-heading4": {
        fontSize: "1.25em",
        lineHeight: "1",
      },

      ".cm-heading5": {
        fontSize: "1.125em",
        lineHeight: "1",
      },

      ".cm-heading6": {
        fontSize: "1em",
        lineHeight: "1",
      },

      ".cm-quote": {
        borderLeft: "0.25em solid var(--color-warning)",
        paddingLeft: "0.5em",
        paddingRight: "0.5em",
        color: "var(--color-warning)",
        fontStyle: "italic",
        margin: "0",
      },

      ".cm-list": {
        paddingLeft: "1em",
      },

      ".cm-hr": {
        borderTop: "2px solid var(--color-base-300)",
        margin: "1rem 0",
      },

      // Code block styling
      ".cm-codeblock": {
        fontFamily: "var(--font-mono)",
        backgroundColor: "var(--color-base-300)",
        padding: "0.5rem",
        borderRadius: "6px",
        fontSize: "0.85em",
        lineHeight: "inherit",
        overflow: "auto",
        wordWrap: "normal",
      },

      // Task list checkboxes
      ".cm-task-marker": {
        marginRight: "0.5rem",
      },

      // Placeholder styling
      ".cm-content[data-placeholder]::before": {
        content: "attr(data-placeholder)",
        color: "var(--color-base-content)",
        opacity: "0.4",
        position: "absolute",
        pointerEvents: "none",
      },

      // Table styling
      ".cm-table": {
        borderCollapse: "collapse",
        margin: "1rem 0",
      },

      ".cm-table-cell": {
        border: "1px solid var(--color-base-300)",
        padding: "0.5rem",
      },

      // Hidden markdown markers (will be used by WYSIWYG extension)
      ".cm-marker-hidden": {
        display: "none",
      },

      ".cm-marker-subtle": {
        opacity: "0.3",
        fontSize: "0.875em",
      },
    },
    {dark: false}, // We handle dark mode via CSS variables
  )
}
