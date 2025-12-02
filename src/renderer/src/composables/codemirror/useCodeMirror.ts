import {onBeforeUnmount, ref, watch} from "vue"

import {defaultKeymap, history, historyKeymap} from "@codemirror/commands"
import {markdown} from "@codemirror/lang-markdown"
import {EditorState} from "@codemirror/state"
import {EditorView, keymap} from "@codemirror/view"

import type {Extension} from "@codemirror/state"
import type {ViewUpdate} from "@codemirror/view"
import type {Ref} from "vue"

export interface UseCodeMirrorOptions {
  content?: string
  onUpdate?: (content: string) => void
  extensions?: Extension[]
  placeholder?: string
}

export interface UseCodeMirrorReturn {
  view: Ref<EditorView | null>
  container: Ref<HTMLElement | null>
  getContent: () => string
  setContent: (content: string) => void
  insertText: (text: string) => void
  focus: () => void
  getSelection: () => {from: number; to: number; text: string} | null
}

/**
 * CodeMirror 6 composable for Vue 3
 * Handles editor initialization, lifecycle, and state synchronization
 */
export function useCodeMirror(options: UseCodeMirrorOptions = {}): UseCodeMirrorReturn {
  const {content = "", onUpdate, extensions = [], placeholder = ""} = options

  const view = ref<EditorView | null>(null)
  const container = ref<HTMLElement | null>(null)

  // Track if we're updating from external source to avoid feedback loops
  let isExternalUpdate = false

  /**
   * Initialize the CodeMirror editor
   */
  function initializeEditor(element: HTMLElement) {
    if (view.value) {
      view.value.destroy()
    }

    // Build extensions array
    const editorExtensions: Extension[] = [
      // Core functionality
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),

      // Markdown language support
      markdown(),

      // Update listener for external state sync
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged && !isExternalUpdate) {
          const newContent = update.state.doc.toString()
          onUpdate?.(newContent)
        }
      }),

      // Placeholder text
      ...(placeholder
        ? [
            EditorView.contentAttributes.of({
              "data-placeholder": placeholder,
            }),
          ]
        : []),

      // Custom extensions from options
      ...extensions,
    ]

    // Create editor state
    const state = EditorState.create({
      doc: content,
      extensions: editorExtensions,
    })

    // Create editor view
    view.value = new EditorView({
      state,
      parent: element,
    })
  }

  /**
   * Get current editor content
   */
  function getContent(): string {
    return view.value?.state.doc.toString() || ""
  }

  /**
   * Set editor content (programmatically)
   */
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

  /**
   * Focus the editor
   */
  function focus() {
    view.value?.focus()
  }

  /**
   * Get current selection
   */
  function getSelection() {
    if (!view.value) return null

    const {from, to} = view.value.state.selection.main
    const text = view.value.state.doc.sliceString(from, to)

    return {from, to, text}
  }

  /**
   * Watch for container changes and initialize editor
   */
  watch(
    container,
    (newContainer) => {
      if (newContainer) {
        initializeEditor(newContainer)
      }
    },
    {immediate: true},
  )

  /**
   * Cleanup on unmount
   */
  onBeforeUnmount(() => {
    view.value?.destroy()
    view.value = null
  })

  return {
    view,
    container,
    getContent,
    setContent,
    insertText,
    focus,
    getSelection,
  }
}
