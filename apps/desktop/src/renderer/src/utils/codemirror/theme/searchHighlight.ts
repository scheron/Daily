import type {StyleSpec} from "./types"

export const searchHighlightStyles: Record<string, StyleSpec> = {
  ".cm-search-highlight": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 50%, transparent)",
    borderRadius: "2px",
    padding: "1px 0",
  },
}
