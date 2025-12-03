import type {StyleSpec} from "@/utils/codemirror/types"

/**
 * Utility styles
 * - Placeholder text
 * - Hidden markers
 * - Subtle markers
 * - Hidden lines (for code fence markers in readonly mode)
 */
export const utilityStyles: Record<string, StyleSpec> = {
  // Placeholder styling
  ".cm-content[data-placeholder]::before": {
    content: "attr(data-placeholder)",
    color: "var(--color-base-content)",
    opacity: "0.4",
    position: "absolute",
    pointerEvents: "none",
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
}
