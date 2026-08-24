import {closeCodeFenceOnEnter} from "./codeBlock"
import {inlineCommands} from "./inlineCommands"

import type {KeyBinding} from "@codemirror/view"

export const markdownKeymap: readonly KeyBinding[] = [
  {key: "Mod-b", run: inlineCommands.toggleBold},
  {key: "Mod-i", run: inlineCommands.toggleItalic},
  {key: "Mod-`", run: inlineCommands.toggleCode},
  {key: "Enter", run: closeCodeFenceOnEnter},
]
