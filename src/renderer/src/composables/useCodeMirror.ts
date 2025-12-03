import {onBeforeUnmount, ref, watch} from "vue"

import {createMarkdownLanguageExtension} from "@/utils/codemirror/extensions/markdownLanguage"

import {defaultKeymap, history, historyKeymap} from "@codemirror/commands"
import {EditorState} from "@codemirror/state"
import {EditorView, keymap} from "@codemirror/view"

import type {Extension} from "@codemirror/state"
import type {KeyBinding, ViewUpdate} from "@codemirror/view"
import type {Ref} from "vue"

export type UseCodeMirrorOptions = {
  content?: string
  onUpdate?: (content: string) => void
  extensions?: Extension[]
  shortcuts?: KeyBinding[]
  placeholder?: string
}

export function useCodeMirror(options: UseCodeMirrorOptions = {}) {
  const {content = "", onUpdate = () => {}, extensions = [], shortcuts = [], placeholder = ""} = options

  const view = ref<EditorView | null>(null)
  const container = ref<HTMLElement | null>(null)

  // Track if we're updating from external source to avoid feedback loops
  let isExternalUpdate = false

  function initializeEditor(element: HTMLElement) {
    if (view.value) {
      view.value.destroy()
    }

    const editorExtensions: Extension[] = [
      history(),
      keymap.of(shortcuts),
      keymap.of([...defaultKeymap, ...historyKeymap]),

      createMarkdownLanguageExtension(),

      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged && !isExternalUpdate) {
          const newContent = update.state.doc.toString()
          onUpdate?.(newContent)
        }
      }),

      ...(placeholder ? [EditorView.contentAttributes.of({"data-placeholder": placeholder})] : []),
      ...extensions,
    ]

    const state = EditorState.create({
      doc: content,
      extensions: editorExtensions,
    })

    view.value = new EditorView({
      state,
      parent: element,
    })
  }

  function getContent(): string {
    return view.value?.state.doc.toString() || ""
  }

  function setContent(newContent: string) {
    if (!view.value) return

    isExternalUpdate = true
    view.value.dispatch({
      changes: {
        from: 0,
        to: view.value.state.doc.length,
        insert: newContent,
      },
    })
    isExternalUpdate = false
  }

  /**
   * Insert text at current cursor position or replace selection
   */
  function insertText(text: string) {
    if (!view.value) return

    const {from, to} = view.value.state.selection.main

    view.value.dispatch({
      changes: {from, to, insert: text},
      selection: {anchor: from + text.length},
    })

    view.value.focus()
  }

  function focus() {
    view.value?.focus()
  }

  function getSelection() {
    if (!view.value) return null

    const {from, to} = view.value.state.selection.main
    const text = view.value.state.doc.sliceString(from, to)

    return {from, to, text}
  }

  watch(
    container,
    (newContainer) => {
      if (newContainer) {
        initializeEditor(newContainer)
      }
    },
    {immediate: true},
  )

  onBeforeUnmount(() => {
    view.value?.destroy()
    view.value = null
  })

  return {
    view: view as Ref<EditorView | null>,
    container,
    getContent,
    setContent,
    insertText,
    focus,
    getSelection,
  }
}
