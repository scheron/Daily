import type {StyleSpec} from "@/utils/codemirror/types"

/**
 * Code block styles
 * - Line backgrounds
 * - First/last line spacing
 * - Content padding for readonly mode
 * - Language indicator
 */
export const codeBlockStyles: Record<string, StyleSpec> = {
  // Code block line styling - creates unified visual block
  ".cm-codeblock-line": {
    backgroundColor: "var(--color-base-300)",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.8",
    color: "var(--color-base-content)",
    paddingLeft: "0.5rem",
    paddingRight: "0.5rem",
    borderRadius: "2px",
    whiteSpace: "pre", // Disable wrapping in code blocks
    overflowX: "auto", // Enable horizontal scroll
  },

  // First line of code block gets top padding, margin and border radius.
  // `position: relative` anchors the absolutely-positioned copy button.
  ".cm-codeblock-first": {
    position: "relative",
    marginTop: "0.75rem",
    paddingTop: "0.5rem",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
  },

  // Copy button in the top-right of a code block
  ".cm-code-copy": {
    position: "absolute",
    top: "0.35rem",
    right: "0.4rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.5rem",
    height: "1.5rem",
    padding: "0",
    border: "0",
    borderRadius: "5px",
    cursor: "pointer",
    color: "var(--color-base-content)",
    background: "color-mix(in srgb, var(--color-base-100) 80%, transparent)",
    opacity: "0.55",
    transition: "opacity 0.15s ease, color 0.15s ease",
    zIndex: "1",
  },

  ".cm-code-copy:hover": {
    opacity: "1",
  },

  ".cm-code-copy.is-copied": {
    color: "var(--color-success)",
    opacity: "1",
  },

  ".cm-code-copy-icon": {
    display: "block",
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
}
