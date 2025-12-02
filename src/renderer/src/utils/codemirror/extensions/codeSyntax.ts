import {syntaxTree} from "@codemirror/language"
import {RangeSet, RangeSetBuilder, StateEffect} from "@codemirror/state"
import {Decoration, ViewPlugin} from "@codemirror/view"
import {isLanguageLoaded, loadLanguage} from "../language/cache"
import {getCodeContentRange, getLanguageFromCodeFence, highlightCodeBlock} from "../language/highlighting"
import {readonlyMode} from "./wysiwyg"

import type {Extension} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"

/**
 * State effect to trigger decoration update after language load
 */
const updateHighlighting = StateEffect.define<null>()

/**
 * Load language asynchronously and trigger view update
 */
async function loadLanguageAndUpdate(view: EditorView, languageName: string) {
  if (isLanguageLoaded(languageName)) return

  await loadLanguage(languageName)

  // Trigger view update after language is loaded
  // Use setTimeout to avoid dispatching during an update
  setTimeout(() => {
    view.dispatch({
      effects: updateHighlighting.of(null),
    })
  }, 0)
}

/**
 * Create syntax highlighting decorations for code blocks
 */
function createCodeSyntaxDecorations(view: EditorView): DecorationSet {
  const lineBuilder = new RangeSetBuilder<Decoration>()
  const markBuilder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(view.state)
  const isReadonly = view.state.facet(readonlyMode)

  // First pass: collect line decorations for backgrounds
  tree.iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        const {from, to} = node
        const languageName = getLanguageFromCodeFence(view, from)

        // Get first and last lines of the entire block (including markers)
        const firstLine = view.state.doc.lineAt(from)
        const lastLine = view.state.doc.lineAt(to)

        // Get content range (excluding markers) for content-first/last classes
        const {contentFrom, contentTo} = getCodeContentRange(view, from, to)
        const firstContentLine = contentFrom < contentTo ? view.state.doc.lineAt(contentFrom) : null
        const lastContentLine = contentFrom < contentTo ? view.state.doc.lineAt(Math.max(contentFrom, contentTo - 1)) : null

        // Apply line decorations to each line in the code block for background
        for (let pos = firstLine.from; pos <= lastLine.to; ) {
          const line = view.state.doc.lineAt(pos)
          const isFirst = line.number === firstLine.number
          const isLast = line.number === lastLine.number
          const isContentFirst = firstContentLine && line.number === firstContentLine.number
          const isContentLast = lastContentLine && line.number === lastContentLine.number

          // Build class list
          let classes = "cm-codeblock-line"
          if (isFirst) classes += " cm-codeblock-first"
          if (isLast) classes += " cm-codeblock-last"
          // Add content-first/last with border-radius only in readonly mode (when markers are hidden)
          if (isReadonly) {
            if (isContentFirst) classes += " cm-codeblock-content-first"
            if (isContentLast) classes += " cm-codeblock-content-last"
          }

          // Apply line decoration for background
          lineBuilder.add(
            line.from,
            line.from,
            Decoration.line({
              class: classes,
              attributes: {
                "data-language": languageName || "plaintext",
              },
            }),
          )

          pos = line.to + 1
          if (pos > view.state.doc.length) break
        }
      }
    },
  })

  // Second pass: collect syntax highlighting decorations
  tree.iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        const {from, to} = node
        const languageName = getLanguageFromCodeFence(view, from)

        // Apply syntax highlighting to code content (excluding markers) if language is loaded
        if (languageName) {
          if (isLanguageLoaded(languageName)) {
            // Language is loaded - apply highlighting to content only
            const {contentFrom, contentTo} = getCodeContentRange(view, from, to)
            if (contentFrom < contentTo) {
              highlightCodeBlock(view, markBuilder, from, to, languageName)
            }
          } else {
            // Load language asynchronously and update
            loadLanguageAndUpdate(view, languageName)
          }
        }
      }
    },
  })

  // Combine both decoration sets
  return RangeSet.join([lineBuilder.finish(), markBuilder.finish()])
}

/**
 * Code Syntax Highlighting Plugin
 */
const codeSyntaxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = createCodeSyntaxDecorations(view)
    }

    update(update: ViewUpdate) {
      // Update decorations on document changes, viewport changes, or highlighting effect
      if (update.docChanged || update.viewportChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(updateHighlighting)))) {
        this.decorations = createCodeSyntaxDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

/**
 * Export code syntax extension
 */
export function createCodeSyntaxExtension(): Extension {
  return [
    // Custom code block highlighting plugin
    // Note: We don't use defaultHighlightStyle to avoid style conflicts
    // All syntax highlighting styles are defined in theme/syntaxHighlighting.ts
    codeSyntaxPlugin,
  ]
}
