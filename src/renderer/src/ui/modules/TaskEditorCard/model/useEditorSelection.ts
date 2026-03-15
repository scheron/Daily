import {computed, onBeforeUnmount, ref, watch} from "vue"

import type {EditorView} from "@codemirror/view"
import type {Ref} from "vue"

export function useEditorSelection(editorView: Ref<EditorView | null>) {
  const selectionBounds = ref<DOMRect | null>(null)
  const hasSelection = ref(false)

  function updateSelectionBounds() {
    if (!editorView.value) {
      selectionBounds.value = null
      hasSelection.value = false
      return
    }

    const selection = editorView.value.state.selection.main

    if (selection.empty) {
      selectionBounds.value = null
      hasSelection.value = false
      return
    }

    hasSelection.value = true

    try {
      const fromCoords = editorView.value.coordsAtPos(selection.from)
      const toCoords = editorView.value.coordsAtPos(selection.to)

      if (fromCoords && toCoords) {
        selectionBounds.value = DOMRect.fromRect({
          x: Math.min(fromCoords.left, toCoords.left),
          y: Math.min(fromCoords.top, toCoords.top),
          width: Math.abs(toCoords.right - fromCoords.left),
          height: Math.abs(toCoords.bottom - fromCoords.top),
        })
      }
    } catch {
      selectionBounds.value = null
      hasSelection.value = false
    }
  }

  let intervalId: number | null = null

  watch(
    editorView,
    (view) => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }

      if (view) {
        updateSelectionBounds()

        intervalId = setInterval(updateSelectionBounds, 50) as unknown as number
      } else {
        selectionBounds.value = null
        hasSelection.value = false
      }
    },
    {immediate: true},
  )

  onBeforeUnmount(() => {
    if (intervalId !== null) {
      clearInterval(intervalId)
    }
  })

  return {
    selectionBounds: computed(() => selectionBounds.value),
    hasSelection: computed(() => hasSelection.value),
  }
}
