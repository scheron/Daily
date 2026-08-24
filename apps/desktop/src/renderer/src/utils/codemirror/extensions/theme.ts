import {EditorView} from "@codemirror/view"
import {codeBlockStyles, editorStyles, markdownStyles, searchHighlightStyles, utilityStyles, widgetStyles} from "../theme"

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
      ...widgetStyles,
      ...utilityStyles,
      ...searchHighlightStyles,
    },
    {dark: dark},
  )
}
