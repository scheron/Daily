import {codeBlockStyles, editorStyles, markdownStyles, searchHighlightStyles, utilityStyles, widgetStyles} from "@/utils/codemirror/theme"
import {EditorView} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

export function createThemeExtension(): Extension {
  return EditorView.theme(
    {
      ...editorStyles,
      ...markdownStyles,
      ...codeBlockStyles,
      ...widgetStyles,
      ...utilityStyles,
      ...searchHighlightStyles,
    },
    {dark: true},
  )
}
