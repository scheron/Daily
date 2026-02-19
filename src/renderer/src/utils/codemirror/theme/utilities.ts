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

  // Autocomplete popup styling
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--color-base-100)",
    border: "1px solid var(--color-base-300)",
    borderRadius: "0.75rem",
    boxShadow: "0 10px 28px color-mix(in srgb, var(--color-base-content) 10%, transparent)",
    overflow: "hidden",
    padding: "0.15rem",
  },

  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans)",
    padding: "0",
    maxHeight: "13rem",
  },

  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    borderRadius: "0.5rem",
    padding: "0.2rem 0.35rem",
  },

  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "transparent",
  },

  ".cm-completionMatchedText": {
    textDecoration: "none",
    fontWeight: "600",
    color: "var(--color-accent)",
  },

  ".cm-tags-autocomplete .cm-completionIcon, .cm-tags-autocomplete .cm-completionLabel, .cm-tags-autocomplete .cm-completionDetail": {
    display: "none",
  },

  ".cm-tags-autocomplete .cm-tag-option-chip": {
    color: "var(--tag-color)",
    border: "1px solid transparent",
    backgroundColor: "transparent",
    borderRadius: "0.625rem",
    padding: "0.35rem 0.7rem",
    display: "flex",
    alignItems: "center",
    lineHeight: "1.25rem",
    width: "100%",
    fontSize: "0.875rem",
  },

  ".cm-tags-autocomplete .cm-tag-option-chip::before": {
    content: '"#"',
    marginRight: "0.08rem",
  },

  ".cm-tags-autocomplete .cm-tag-option-chip-remove::before": {
    content: '"-#"',
  },

  ".cm-tags-autocomplete li[aria-selected] .cm-tag-option-chip": {
    borderColor: "var(--tag-color)",
    backgroundColor: "color-mix(in srgb, var(--tag-color) 20%, transparent)",
  },

  ".cm-tags-autocomplete .cm-tag-option-remove .cm-tag-option-chip": {
    color: "var(--color-error)",
  },
}
