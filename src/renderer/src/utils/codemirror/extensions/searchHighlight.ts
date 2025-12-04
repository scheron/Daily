import {Decoration, ViewPlugin} from "@codemirror/view"

import type {Extension} from "@codemirror/state"
import type {DecorationSet} from "@codemirror/view"
import type {SearchMatch} from "@shared/types/search"

function createHighlightDecorations(matches?: SearchMatch[]): DecorationSet {
  if (!matches || matches.length === 0) {
    return Decoration.none
  }

  const decorations: any[] = []

  for (const match of matches) {
    if (match.indices && match.indices.length > 0) {
      for (const [start, end] of match.indices) {
        decorations.push(Decoration.mark({class: "cm-search-highlight"}).range(start, end + 1))
      }
    }
  }
  decorations.sort((a, b) => a.from - b.from)

  return Decoration.set(decorations)
}

export function createSearchHighlightExtension(matches?: SearchMatch[]): Extension {
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
