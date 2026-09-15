import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"
import {keymap} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

export function createAutoPairsExtension(): Extension {
  return [
    EditorState.languageData.of(() => [
      {
        closeBrackets: {
          brackets: ["(", "[", "{", '"', "'", "_"],
        },
      },
    ]),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
  ]
}
