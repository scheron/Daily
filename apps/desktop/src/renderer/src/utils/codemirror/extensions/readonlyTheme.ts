import {EditorView} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

const regularTheme = EditorView.theme({
  ".cm-cursor": {display: "none"},
  ".cm-content": {cursor: "default"},
  "&.cm-focused": {outline: "none"},
})

const compactTheme = EditorView.theme({
  ".cm-cursor": {display: "none"},
  ".cm-content": {cursor: "default", fontSize: "10px", lineHeight: "1.4"},
  "&.cm-focused": {outline: "none"},
  ".cm-line": {fontSize: "10px"},
})

/** Every editor shares one of these two modules, so mounting another editor adds no styles to the document. */
export function createReadonlyThemeExtension(options: {isCompact: boolean}): Extension {
  return options.isCompact ? compactTheme : regularTheme
}
