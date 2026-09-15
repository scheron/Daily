import {inlineCommands} from "./inlineCommands"

import type {EditorView, KeyBinding} from "@codemirror/view"

export const markdownKeymap: readonly KeyBinding[] = [
  {key: "Mod-b", run: inlineCommands.toggleBold},
  {key: "Mod-i", run: inlineCommands.toggleItalic},
  {key: "Mod-`", run: inlineCommands.toggleCode},
  {key: "Enter", run: closeCodeFenceOnEnter},
]

function closeCodeFenceOnEnter(view: EditorView): boolean {
  const {state} = view
  const selection = state.selection.main
  if (!selection.empty) return false

  const line = state.doc.lineAt(selection.head)
  if (selection.head !== line.to) return false

  const match = line.text.match(/^(\s*)(`{3,}|~{3,})([A-Za-z][\w+#.-]*)\s*$/)
  if (!match) return false

  const [, indent, fence] = match
  const closingFence = new RegExp(`^\\s*[${fence[0]}]{${fence.length},}\\s*$`)
  for (let lineNumber = line.number + 1; lineNumber <= state.doc.lines; lineNumber++) {
    if (closingFence.test(state.doc.line(lineNumber).text)) return false
  }

  view.dispatch({
    changes: {from: selection.head, insert: `\n${indent}\n${indent}${fence}`},
    selection: {anchor: selection.head + 1 + indent.length},
    scrollIntoView: true,
  })
  return true
}
