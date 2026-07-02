import {resolveCodeLanguage} from "@/utils/codemirror/language/codeLanguages"
import {codeHighlightStyle} from "@/utils/codemirror/theme/highlightStyle"

import {markdown, markdownLanguage} from "@codemirror/lang-markdown"
import {syntaxHighlighting} from "@codemirror/language"

import type {Extension} from "@codemirror/state"

/**
 * Markdown language extension.
 *
 * Provides GFM markdown support (task lists, strikethrough, tables) and nests
 * each fenced block's language parser into the document tree via the eager
 * `resolveCodeLanguage` resolver. Syntax colors for that nested code come from
 * the standard `syntaxHighlighting(codeHighlightStyle)` pass bundled here.
 */
export function createMarkdownLanguageExtension(): Extension {
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages: resolveCodeLanguage,
      addKeymap: true,
    }),
    syntaxHighlighting(codeHighlightStyle),
  ]
}
