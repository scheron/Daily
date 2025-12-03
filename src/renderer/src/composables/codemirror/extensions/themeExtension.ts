import {EditorView} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

/**
 * Custom CodeMirror theme that matches Daily's markdown.css styles
 * Uses CSS variables for theme integration and supports dark/light modes
 */
export function createThemeExtension(): Extension {
  return EditorView.theme(
    {
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

      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-accent)",
        borderLeftWidth: "2px",
        marginLeft: "-1px",
      },

      "&.cm-focused": {
        outline: "none",
      },

      "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--color-accent)",
        opacity: "0.25",
      },

      ".cm-selectionBackground": {
        backgroundColor: "var(--color-accent)",
        opacity: "0.2",
      },

      ".cm-activeLine": {
        backgroundColor: "transparent",
      },

      ".cm-gutters": {
        display: "none",
      },

      // Markdown-specific styling (matches markdown.css)
      ".cm-strong": {
        fontWeight: "600",
        color: "var(--color-base-content)",
      },

      ".cm-emphasis": {
        fontStyle: "italic",
        color: "var(--color-base-content)",
      },

      // Inline code (matches markdown.css code styling)
      ".cm-code": {
        fontFamily: "var(--font-mono)",
        backgroundColor: "var(--color-base-300)",
        padding: "0.2em 0.4em",
        margin: "0",
        lineHeight: "1.6",
        whiteSpace: "break-spaces",
        borderRadius: "2px",
      },

      // Links (matches markdown.css anchor styling)
      ".cm-link": {
        color: "var(--color-info)",
        textDecoration: "none",
        cursor: "pointer",
      },

      ".cm-link:hover": {
        textDecoration: "underline",
      },

      // Headings (exact match with markdown.css)
      ".cm-heading": {
        fontWeight: "600",
        color: "var(--color-base-content)",
        marginTop: "0.75rem",
        marginBottom: "0.5rem",
        textDecoration: "none",
        borderBottom: "none",
      },

      ".cm-heading1": {
        fontSize: "1.35em",
        lineHeight: "1.4",
        margin: "0.5em 0",
        paddingBottom: "0.1em",
        fontWeight: "600",
        textDecoration: "none",
        borderBottom: "none",
      },

      ".cm-heading2": {
        fontSize: "1.25em",
        lineHeight: "1.3",
        fontWeight: "600",
        textDecoration: "none",
        borderBottom: "none",
      },

      ".cm-heading3": {
        fontSize: "1.15em",
        lineHeight: "1.2",
        fontWeight: "600",
        textDecoration: "none",
        borderBottom: "none",
      },

      ".cm-heading4": {
        fontSize: "1.1em",
        lineHeight: "1.1",
        fontWeight: "600",
        textDecoration: "none",
        borderBottom: "none",
      },

      ".cm-heading5": {
        fontSize: "1.05em",
        lineHeight: "1.1",
        fontWeight: "600",
        textDecoration: "none",
        borderBottom: "none",
      },

      ".cm-heading6": {
        fontSize: "1em",
        lineHeight: "1.1",
        fontWeight: "600",
        textDecoration: "none",
        borderBottom: "none",
      },

      // Blockquote (matches markdown.css)
      ".cm-quote": {
        margin: "0",
        padding: "0 0.5em",
        color: "var(--color-warning)",
        fontStyle: "italic",
        borderLeft: "0.25em solid var(--color-warning)",
      },

      // Lists
      ".cm-list": {
        paddingLeft: "1em",
      },

      // Horizontal rule (matches markdown.css)
      ".cm-hr": {
        display: "block",
        height: "1px",
        padding: "0",
        margin: "0.75rem 0",
        backgroundColor: "color-mix(in oklab, var(--color-base-content) 40%, var(--color-base-200) 80%)",
        border: "0",
        overflow: "hidden",
      },

      // Code block line styling - creates unified visual block
      ".cm-codeblock-line": {
        backgroundColor: "var(--color-base-300)",
        fontFamily: "var(--font-mono)",
        lineHeight: "1.8",
        color: "#c9d1d9",
        paddingLeft: "0.5rem",
        paddingRight: "0.5rem",
        borderRadius: "2px",
        whiteSpace: "pre", // Disable wrapping in code blocks
        overflowX: "auto", // Enable horizontal scroll
      },

      // First line of code block gets top padding, margin and border radius
      ".cm-codeblock-first": {
        marginTop: "0.75rem",
        paddingTop: "0.5rem",
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
      },

      // Last line of code block gets bottom padding, margin and border radius
      ".cm-codeblock-last": {
        marginBottom: "0.75rem",
        paddingBottom: "0.5rem",
        borderBottomLeftRadius: "6px",
        borderBottomRightRadius: "6px",
      },

      // First content line (code after opening marker) - for readonly mode
      ".cm-codeblock-content-first": {
        paddingTop: "1rem",
        borderTopLeftRadius: "4px",
        borderTopRightRadius: "4px",
      },

      // Last content line (code before closing marker) - for readonly mode
      ".cm-codeblock-content-last": {
        paddingBottom: "1rem",
        borderBottomLeftRadius: "4px",
        borderBottomRightRadius: "4px",
      },

      // Code language indicator
      ".cm-code-lang": {
        color: "var(--color-accent)",
        opacity: "0.7",
      },

      // Syntax highlighting tokens (GitHub Dark theme - matches highlight.js)
      // Keywords (const, let, function, class, import, export, etc.)
      ".tok-keyword": {
        color: "#ff7b72",
      },

      // Control keywords (if, else, return, etc.)
      ".tok-controlKeyword": {
        color: "#ff7b72",
      },

      // Module keywords (import, export, etc.)
      ".tok-moduleKeyword": {
        color: "#ff7b72",
      },

      // Operators (+, -, =, etc.)
      ".tok-operator": {
        color: "#79c0ff",
      },

      // Strings
      ".tok-string": {
        color: "#a5d6ff",
      },

      // Comments
      ".tok-comment, .tok-lineComment, .tok-blockComment, .tok-docComment": {
        color: "#8b949e",
        fontStyle: "italic",
      },

      // Numbers
      ".tok-number": {
        color: "#79c0ff",
      },

      // Booleans and null
      ".tok-bool, .tok-null": {
        color: "#79c0ff",
      },

      // Variable names
      ".tok-variableName": {
        color: "#c9d1d9",
      },

      // Local variable names
      ".tok-local": {
        color: "#c9d1d9",
      },

      // Function/method definitions
      ".tok-definition": {
        color: "#d2a8ff",
      },

      // Type names and class names
      ".tok-typeName, .tok-className": {
        color: "#d2a8ff",
      },

      // Function calls
      ".tok-function": {
        color: "#d2a8ff",
      },

      // Property names
      ".tok-propertyName": {
        color: "#79c0ff",
      },

      // HTML/JSX tag names
      ".tok-tagName": {
        color: "#7ee787",
      },

      // HTML/JSX attribute names
      ".tok-attributeName": {
        color: "#79c0ff",
      },

      // Punctuation, brackets, etc.
      ".tok-punctuation, .tok-bracket, .tok-separator, .tok-paren, .tok-brace, .tok-squareBracket": {
        color: "#c9d1d9",
      },

      // Regular expressions
      ".tok-regexp": {
        color: "#a5d6ff",
      },

      // Special tokens (this, self)
      ".tok-special": {
        color: "#ff7b72",
      },

      // Meta information
      ".tok-meta": {
        color: "#79c0ff",
      },

      // Invalid/error tokens
      ".tok-invalid": {
        color: "#ffdcd7",
        backgroundColor: "#67060c",
      },

      // Generic names
      ".tok-name": {
        color: "#7ee787",
      },

      // Literals (true, false, null)
      ".tok-literal": {
        color: "#79c0ff",
      },

      // Self/this keywords
      ".tok-self": {
        color: "#ff7b72",
      },

      // Standard types
      ".tok-standard": {
        color: "#79c0ff",
      },

      // Namespaces/modules
      ".tok-namespace": {
        color: "#d2a8ff",
      },

      // Built-in symbols
      ".tok-builtin": {
        color: "#ffa657",
      },

      // Constants
      ".tok-constant": {
        color: "#79c0ff",
      },

      // Variables with special meaning
      ".tok-variableSpecial": {
        color: "#ffa657",
      },

      // Diff: deleted
      ".tok-deleted": {
        color: "#ffdcd7",
        backgroundColor: "#67060c",
      },

      // Diff: inserted
      ".tok-inserted": {
        color: "#aff5b4",
        backgroundColor: "#033a16",
      },

      // Diff: changed
      ".tok-changed": {
        color: "#f2cc60",
      },

      // Markdown: headings
      ".tok-heading": {
        color: "#1f6feb",
        fontWeight: "600",
      },

      // Markdown: links
      ".tok-link": {
        color: "#79c0ff",
        textDecoration: "underline",
      },

      // Markdown: strong
      ".tok-strong": {
        color: "#c9d1d9",
        fontWeight: "600",
      },

      // Markdown: emphasis
      ".tok-emphasis": {
        color: "#c9d1d9",
        fontStyle: "italic",
      },

      // Markdown: code
      ".tok-monospace": {
        color: "#c9d1d9",
      },

      // Task list checkboxes
      ".cm-task-marker": {
        display: "inline-flex",
        alignItems: "center",
        marginRight: "0.5rem",
        marginLeft: "0.5rem",
        verticalAlign: "middle",
        lineHeight: "1.8",
      },

      // Checkbox base styles (matches markdown.css)
      ".cm-task-checkbox": {
        appearance: "none",
        width: "1.2em",
        height: "1.2em",
        border: "2px solid var(--color-base-content)",
        borderRadius: "4px",
        verticalAlign: "middle",
        position: "relative",
        margin: "0",
        backgroundColor: "transparent",
      },

      // Checked checkbox styles
      ".cm-task-checkbox-checked": {
        backgroundColor: "var(--color-accent)",
        borderColor: "var(--color-accent)",
      },

      // Checkmark inside checked checkbox (using ::after pseudo-element)
      ".cm-task-checkbox-checked::after": {
        content: "''",
        display: "block",
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%) rotate(45deg)",
        width: "0.3em",
        height: "0.6em",
        border: "solid var(--color-base-100)",
        borderWidth: "0 2px 2px 0",
      },

      // Lines containing task markers should have consistent height
      ".cm-line:has(.cm-task-marker)": {
        minHeight: "1.8em",
        display: "flex",
        alignItems: "center",
      },

      // Placeholder styling
      ".cm-content[data-placeholder]::before": {
        content: "attr(data-placeholder)",
        color: "var(--color-base-content)",
        opacity: "0.4",
        position: "absolute",
        pointerEvents: "none",
      },

      // Table styling (matches markdown.css)
      ".cm-table": {
        borderSpacing: "0",
        borderCollapse: "collapse",
        display: "block",
        width: "max-content",
        maxWidth: "100%",
        overflow: "auto",
        margin: "0.5rem 0",
        fontSize: "0.8em",
      },

      ".cm-table-cell": {
        padding: "6px 13px",
        border: "1px solid var(--color-base-300)",
      },

      ".cm-table-header": {
        fontWeight: "600",
        backgroundColor: "var(--color-base-300)",
      },

      // Hidden markdown markers
      ".cm-marker-hidden": {
        display: "none",
      },

      ".cm-marker-subtle": {
        opacity: "0.3",
        fontSize: "0.875em",
        color: "var(--color-base-content)",
      },

      // Hide entire lines (for code fence markers in readonly mode)
      // Collapse the line but preserve margins from .cm-codeblock-first/last
      ".cm-hide-line": {
        visibility: "hidden !important",
        height: "0 !important",
        lineHeight: "0 !important",
        overflow: "hidden !important",
        pointerEvents: "none !important",
      },

      // When first marker is hidden, keep margin but remove padding
      ".cm-hide-line.cm-codeblock-first": {
        paddingTop: "0 !important",
        marginTop: "0.75rem !important",
      },

      // When last marker is hidden, keep margin but remove padding
      ".cm-hide-line.cm-codeblock-last": {
        paddingBottom: "0 !important",
        marginBottom: "0.75rem !important",
      },
    },
    {dark: false}, // We handle dark mode via CSS variables
  )
}
