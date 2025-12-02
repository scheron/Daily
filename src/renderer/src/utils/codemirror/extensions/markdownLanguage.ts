import {markdown, markdownLanguage} from "@codemirror/lang-markdown"
import {languages} from "@codemirror/language-data"

import type {Extension} from "@codemirror/state"

/**
 * Markdown language extension
 * Provides markdown language support with GFM (task lists, strikethrough, tables)
 */
export function createMarkdownLanguageExtension(): Extension {
  return markdown({
    base: markdownLanguage, // Use GFM-enabled language
    codeLanguages: languages,
  })
}
