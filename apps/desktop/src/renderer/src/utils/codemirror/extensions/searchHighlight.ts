import {sort} from "fast-sort"

import {Decoration, ViewPlugin} from "@codemirror/view"

import type {Extension, Range} from "@codemirror/state"
import type {DecorationSet} from "@codemirror/view"
import type {SearchMatch} from "@daily/protocol"

export function createSearchHighlightExtension(matches: SearchMatch[] | undefined): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor() {
        this.decorations = createHighlightDecorations(matches)
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  )
}

function createHighlightDecorations(matches: SearchMatch[] | undefined): DecorationSet {
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
