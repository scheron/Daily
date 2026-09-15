import {EditorState} from "@codemirror/state"
import {EditorView} from "@codemirror/view"

import type {Extension} from "@codemirror/state"

type MountOptions = {selection?: {anchor: number; head?: number}; extensions?: Extension[]}

export function mountEditorView(doc: string, {selection, extensions = []}: MountOptions): EditorView {
  const parent = document.createElement("div")
  document.body.appendChild(parent)
  return new EditorView({state: EditorState.create({doc, selection, extensions}), parent})
}

export function unmountEditorView(view: EditorView) {
  const parent = view.dom.parentElement
  view.destroy()
  parent?.remove()
}

export function pressKey(view: EditorView, init: KeyboardEventInit) {
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, cancelable: true, ...init}))
}

export function typeText(view: EditorView, text: string) {
  for (const char of text) {
    const {from, to} = view.state.selection.main
    const insert = () => view.state.update({changes: {from, to, insert: char}, selection: {anchor: from + char.length}, userEvent: "input.type"})
    const isHandled = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, char, insert))
    if (!isHandled) view.dispatch(insert())
  }
}
