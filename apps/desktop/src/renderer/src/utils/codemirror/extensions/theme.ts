import {codeBlockStyles, editorStyles, markdownStyles, searchHighlightStyles, utilityStyles, widgetStyles} from "@/utils/codemirror/theme"
import {EditorView} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

const themeExtension = EditorView.theme(
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

/** Every editor shares this module, so mounting another editor adds no styles to the document. */
export function createThemeExtension(): Extension {
  return themeExtension
}
