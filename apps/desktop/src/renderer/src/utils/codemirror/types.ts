import type {EditorView} from "@codemirror/view"

export type StyleSpec = {
  [propOrSelector: string]: string | number | StyleSpec | null
}

export type MarkdownCommand = (view: EditorView) => boolean
