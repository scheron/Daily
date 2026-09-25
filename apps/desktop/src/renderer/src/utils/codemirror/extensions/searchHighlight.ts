import {sort} from "fast-sort"

import {Decoration} from "@codemirror/view"

import type {Range} from "@codemirror/state"
import type {DecorationSet} from "@codemirror/view"
import type {SearchMatch} from "@daily/protocol"

/** The read-only preview renders the same set, so the editor and the previews cannot drift. */
export function buildSearchHighlightDecorations(matches: SearchMatch[] | undefined): DecorationSet {
  if (!matches || matches.length === 0) {
    return Decoration.none
  }

  const decorations: Range<Decoration>[] = []

  for (const match of matches) {
    if (match.indices && match.indices.length > 0) {
      for (const [start, end] of match.indices) {
        decorations.push(Decoration.mark({class: "cm-search-highlight"}).range(start, end + 1))
      }
    }
  }
  return Decoration.set(sort(decorations).asc((d) => d.from))
}
