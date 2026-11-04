import type {Editor} from "@tiptap/core"

export function findTipTapEditor(element: Element) {
  return (element.querySelector(".tiptap") as (HTMLElement & {editor: Editor}) | null)?.editor
}

export function pressTipTapKey(editor: Editor, key: string, modifiers: KeyboardEventInit = {}) {
  return editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true, ...modifiers}))
}

export function typeTipTapText(editor: Editor, text: string) {
  for (const char of text) {
    const {from, to} = editor.state.selection
    const insert = () => editor.state.tr.insertText(char, from, to)
    const handled = editor.view.someProp("handleTextInput", (handle) => handle(editor.view, from, to, char, insert))
    if (!handled) editor.view.dispatch(insert())
  }
}
