import {EditorView} from "@codemirror/view"
import {codeBlockStyles} from "../theme/codeBlocks"
import {editorStyles} from "../theme/editor"
import {markdownStyles} from "../theme/markdown"
import {searchHighlightStyles} from "../theme/searchHighlight"
import {syntaxHighlightingStyles} from "../theme/syntaxHighlighting"
import {utilityStyles} from "../theme/utilities"
import {widgetStyles} from "../theme/widgets"

import type {Extension} from "@codemirror/state"

/**
 * Theme extension
 * Applies all theme styles to the editor
 */
export function createThemeExtension(dark: boolean = true): Extension {
  return EditorView.theme(
    {
      ...editorStyles,
      ...markdownStyles,
      ...codeBlockStyles,
      ...syntaxHighlightingStyles,
      ...widgetStyles,
      ...utilityStyles,
      ...searchHighlightStyles,
    },
    {dark: dark},
  )
}
