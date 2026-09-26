import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {inlineCommands} from "./inlineCommands"

import type {EditorView, KeyBinding} from "@codemirror/view"

export const markdownKeymap: readonly KeyBinding[] = [
  {key: toCodeMirrorKey(SHORTCUTS_MAP["markdown:bold"].accelerator), run: inlineCommands.toggleBold},
  {key: toCodeMirrorKey(SHORTCUTS_MAP["markdown:italic"].accelerator), run: inlineCommands.toggleItalic},
  {key: toCodeMirrorKey(SHORTCUTS_MAP["markdown:code"].accelerator), run: inlineCommands.toggleCode},
  {key: "Enter", run: closeCodeFenceOnEnter},
]

function toCodeMirrorKey(accelerator: string): string {
  const parts = accelerator.split("+")
  const key = parts.at(-1) ?? ""
  const mods = parts.slice(0, -1).map((mod) => (mod === "CmdOrCtrl" ? "Mod" : mod))
  return mods.concat(key.length === 1 ? key.toLowerCase() : key).join("-")
}

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
