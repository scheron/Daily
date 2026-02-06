import type {StyleSpec} from "@/utils/codemirror/types"

/**
 * Markdown element styles
 * - Inline formatting (bold, italic, code)
 * - Links
 * - Headings (h1-h6)
 * - Blockquotes
 * - Lists
 * - Horizontal rules
 * - Tables
 */
export const markdownStyles: Record<string, StyleSpec> = {
  // Inline formatting
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
    margin: "0",
    lineHeight: "1.6",
    whiteSpace: "break-spaces",
    borderRadius: "2px",
  },

  // Links
  ".cm-link": {
    color: "var(--color-info)",
    textDecoration: "none",
    cursor: "pointer",
  },

  ".cm-link:hover": {
    textDecoration: "underline",
  },

  // Headings
  ".cm-heading": {
    fontWeight: "600",
    color: "var(--color-base-content)",
    marginTop: "0.75rem",
    marginBottom: "0.5rem",
    textDecoration: "none",
    borderBottom: "none",
  },

  ".cm-heading1": {
    fontSize: "1.45em !important",
    lineHeight: "1.1 !important",
    margin: "0.5em 0 !important",
    paddingBottom: "0.5em !important",
    fontWeight: "600",
    textDecoration: "none",
    borderBottom: "none",
  },

  ".cm-heading2": {
    fontSize: "1.4em !important",
    lineHeight: "1.3 !important",
    fontWeight: "600",
    textDecoration: "none",
    borderBottom: "none",
  },

  ".cm-heading3": {
    fontSize: "1.2em !important",
    lineHeight: "1.2",
    fontWeight: "600",
    textDecoration: "none",
    borderBottom: "none",
  },

  ".cm-heading4": {
    fontSize: "1.15em !important",
    lineHeight: "1.1",
    fontWeight: "600",
    textDecoration: "none",
    borderBottom: "none",
  },

  ".cm-heading5": {
    fontSize: "1.1em !important",
    lineHeight: "1.1",
    fontWeight: "600",
    textDecoration: "none",
    borderBottom: "none",
  },

  ".cm-heading6": {
    fontSize: "1em !important",
    lineHeight: "1.1",
    fontWeight: "600",
    textDecoration: "none",
    borderBottom: "none",
  },

  // Blockquote
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

  // Horizontal rule
  ".cm-hr": {
    display: "block",
    height: "1px",
    padding: "0",
    margin: "0.75rem 0",
    backgroundColor: "color-mix(in oklab, var(--color-base-content) 40%, var(--color-base-200) 80%)",
    border: "0",
    overflow: "hidden",
  },

  // Tables
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
}
