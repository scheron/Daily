import {ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {useEventListener} from "@vueuse/core"

import {insertImageFile} from "../utils/insertImageFile"

import type {EditorView} from "@codemirror/view"
import type {Ref, ShallowRef} from "vue"

export function useFileDrop(dropZone: Ref<HTMLElement | null>, view: ShallowRef<EditorView | null>) {
  const isDraggingOver = ref(false)

  useEventListener(dropZone, "dragover", (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    isDraggingOver.value = true

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy"
    }
  })

  useEventListener(dropZone, "dragleave", (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const rect = dropZone.value?.getBoundingClientRect()
    if (!rect) return

    const x = event.clientX
    const y = event.clientY

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      isDraggingOver.value = false
    }
  })

  useEventListener(dropZone, "drop", (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    isDraggingOver.value = false

    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        insertImageFile(file, view)
      } else {
        toasts.error(`Only image files are supported. "${file.name}" is not an image.`)
      }
    }
  })

  return {
    isDraggingOver,
  }
}
