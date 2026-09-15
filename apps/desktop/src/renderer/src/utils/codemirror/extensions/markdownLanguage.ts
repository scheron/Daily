import {resolveCodeLanguage} from "@/utils/codemirror/language"
import {codeHighlightStyle} from "@/utils/codemirror/theme"
import {markdown, markdownLanguage} from "@codemirror/lang-markdown"
import {syntaxHighlighting} from "@codemirror/language"

import type {Extension} from "@codemirror/state"

/** Each fenced block's language is nested into the tree and its syntax highlighting comes bundled, so callers add no `syntaxHighlighting` of their own. */
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
