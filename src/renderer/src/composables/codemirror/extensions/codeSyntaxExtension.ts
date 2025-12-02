import {syntaxTree} from "@codemirror/language"
import {languages} from "@codemirror/language-data"
import {RangeSet, RangeSetBuilder, StateEffect} from "@codemirror/state"
import {Decoration, ViewPlugin} from "@codemirror/view"
import {classHighlighter, highlightTree} from "@lezer/highlight"
import {readonlyMode} from "./wysiwygExtension"

import type {LanguageSupport} from "@codemirror/language"
import type {Extension} from "@codemirror/state"
import type {DecorationSet, EditorView, ViewUpdate} from "@codemirror/view"

// Cache for loaded language parsers
const languageCache = new Map<string, LanguageSupport | null>()

// State effect to trigger decoration update after language load
const updateHighlighting = StateEffect.define<null>()

/**
 * Attempt to load a language parser dynamically
 */
async function loadLanguage(languageName: string): Promise<LanguageSupport | null> {
  // Check cache first
  if (languageCache.has(languageName)) {
    return languageCache.get(languageName) || null
  }

  // Find language in CodeMirror's language data
  const langInfo = languages.find(
    (lang) =>
      lang.name.toLowerCase() === languageName.toLowerCase() || lang.alias?.some((alias) => alias.toLowerCase() === languageName.toLowerCase()),
  )

  if (!langInfo) {
    languageCache.set(languageName, null)
    return null
  }

  try {
    // Load language support dynamically
    const language = await langInfo.load()
    languageCache.set(languageName, language)
    return language
  } catch (err) {
    console.warn(`Failed to load language: ${languageName}`, err)
    languageCache.set(languageName, null)
    return null
  }
}

/**
 * Extract language name from code fence
 */
function getLanguageFromCodeFence(view: EditorView, fenceStart: number): string | null {
  const line = view.state.doc.lineAt(fenceStart)
  const text = line.text

  // Match ```language
  const match = text.match(/^```(\w+)/)
  return match ? match[1] : null
}

/**
 * Find the code content range (excluding fence markers)
 */
function getCodeContentRange(view: EditorView, fenceFrom: number, fenceTo: number) {
  const firstLine = view.state.doc.lineAt(fenceFrom)
  const lastLine = view.state.doc.lineAt(fenceTo)

  // Start after first line (opening ```)
  const contentFrom = firstLine.to + 1

  // End at start of last line (closing ```)
  const contentTo = Math.max(contentFrom, lastLine.from)

  return {contentFrom, contentTo}
}

/**
 * Apply syntax highlighting to code content (synchronous version)
 */
function highlightCodeBlockSync(
  view: EditorView,
  builder: RangeSetBuilder<Decoration>,
  fenceFrom: number,
  fenceTo: number,
  languageName: string | null,
) {
  if (!languageName) return

  // Check if language is already loaded (synchronously)
  const lang = languageCache.get(languageName)
  if (!lang) return

  const {contentFrom, contentTo} = getCodeContentRange(view, fenceFrom, fenceTo)
  if (contentFrom >= contentTo) return

  const codeText = view.state.doc.sliceString(contentFrom, contentTo)

  try {
    // Parse the code with the language parser
    const tree = lang.language.parser.parse(codeText)

    // Apply syntax highlighting decorations using classHighlighter
    // classHighlighter automatically maps Lezer tags to CSS classes
    highlightTree(tree, classHighlighter, (from: number, to: number, classes: string) => {
      // Offset positions to match document positions
      const decorationFrom = contentFrom + from
      const decorationTo = contentFrom + to

      if (classes && decorationFrom < decorationTo && decorationTo <= view.state.doc.length) {
        builder.add(
          decorationFrom,
          decorationTo,
          Decoration.mark({
            class: classes,
          }),
        )
      }
    })
  } catch (err) {
    console.warn(`Failed to highlight code block:`, err)
  }
}

/**
 * Load language asynchronously and trigger view update
 */
async function loadLanguageAndUpdate(view: EditorView, languageName: string) {
  if (languageCache.has(languageName)) return

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

  // First pass: collect line decorations
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
          if (languageCache.has(languageName)) {
            // Language is loaded or attempted - apply highlighting to content only
            const {contentFrom, contentTo} = getCodeContentRange(view, from, to)
            if (contentFrom < contentTo) {
              highlightCodeBlockSync(view, markBuilder, from, to, languageName)
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
      // Update decorations on document changes, selection changes, or highlighting effect
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
    // All syntax highlighting styles are defined in themeExtension.ts
    codeSyntaxPlugin,
  ]
}
