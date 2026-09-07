import type {StyleSpec} from "@/utils/codemirror/types"

/**
 * Search highlight styles
 * - Highlighted text matches from search queries
 */
export const searchHighlightStyles: Record<string, StyleSpec> = {
  ".cm-search-highlight": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 50%, transparent)",
    borderRadius: "2px",
    padding: "1px 0",
  },
}
