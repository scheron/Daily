import {closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete"
import {EditorState} from "@codemirror/state"
import {keymap} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

/**
 * Auto-pairs extension for CodeMirror
 * Uses built-in closeBrackets with custom config for markdown markers
 */
export function createAutoPairsExtension(): Extension {
  return [
    // Configure closeBrackets via languageData
    EditorState.languageData.of(() => [
      {
        closeBrackets: {
          brackets: ["(", "[", "{", '"', "'", "`", "*", "_", "~"],
        },
      },
    ]),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
  ]
}
