import {codeBlockStyles, editorStyles, markdownStyles, searchHighlightStyles, utilityStyles, widgetStyles} from "@/utils/codemirror/theme"
import {EditorView} from "@codemirror/view"

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
