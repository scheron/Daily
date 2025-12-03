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
}
