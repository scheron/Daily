import {Extension} from "@codemirror/state"
import {EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet} from "@codemirror/view"
import {syntaxTree} from "@codemirror/language"
import {languages} from "@codemirror/language-data"
import {LanguageSupport} from "@codemirror/language"
import {RangeSetBuilder} from "@codemirror/state"

// Cache for loaded language parsers
const languageCache = new Map<string, LanguageSupport | null>()

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
      lang.name.toLowerCase() === languageName.toLowerCase() ||
      lang.alias?.some((alias) => alias.toLowerCase() === languageName.toLowerCase()),
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
 * Create syntax highlighting decorations for code blocks
 * Note: This is a simplified version. Full implementation would parse
 * the code content with language-specific parsers and apply highlighting
 */
function createCodeSyntaxDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(view.state)

  tree.iterate({
    enter: (node) => {
      if (node.name === "FencedCode") {
        const {from, to} = node
        const languageName = getLanguageFromCodeFence(view, from)

        if (languageName) {
          // Schedule async language loading (for future enhancement)
          loadLanguage(languageName).then((lang) => {
            if (lang) {
              // TODO: Apply language-specific highlighting
              // This would require more complex integration with CodeMirror's
              // language parsing system
            }
          })
        }

        // For now, just mark code blocks with a class
        // The theme extension will handle the visual styling
        builder.add(
          from,
          to,
          Decoration.mark({
            class: "cm-codeblock",
            attributes: {
              "data-language": languageName || "plaintext",
            },
          }),
        )
      }
    },
  })

  return builder.finish()
}

/**
 * Code Syntax Highlighting Plugin
 * Note: This is a foundational implementation. For full syntax highlighting
 * within code blocks, you would need to integrate language-specific parsers
 * and create nested editor states for each code block.
 */
const codeSyntaxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = createCodeSyntaxDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
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
 *
 * NOTE: This is a simplified implementation that marks code blocks.
 * For full language-specific syntax highlighting within code blocks,
 * you would need a more sophisticated approach:
 *
 * 1. Parse the code block content separately with language parser
 * 2. Create decorations based on parsed tokens
 * 3. Map token styles to existing highlight.js theme colors
 *
 * For now, code blocks will use monospace font and background color
 * (styled via the theme extension) without language-specific coloring.
 * This matches the current behavior where markdown-it renders code blocks
 * with highlight.js only in the final TaskCard view, not during editing.
 */
export function createCodeSyntaxExtension(): Extension {
  return [codeSyntaxPlugin]
}
