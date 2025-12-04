import {inlineCommands} from "./inlineCommands"

export function createMarkdownKeymap() {
  return [
    {key: "Mod-b", run: inlineCommands.toggleBold},
    {key: "Mod-i", run: inlineCommands.toggleItalic},
    {key: "Mod-`", run: inlineCommands.toggleCode},
  ]
}
