import {uploadImageFile} from "./uploadImageFile"

import type {EditorView} from "@codemirror/view"
import type {ShallowRef} from "vue"

export async function insertImageFile(file: File, view: ShallowRef<EditorView | null>): Promise<void> {
  const md = await uploadImageFile(file)
  if (!md || !view.value) return

  const {from, to} = view.value.state.selection.main
  view.value.dispatch({
    changes: {from, to, insert: md},
    selection: {anchor: from + md.length},
  })
  view.value.focus()
}
