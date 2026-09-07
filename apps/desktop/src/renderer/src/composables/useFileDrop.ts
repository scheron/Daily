import {ref} from "vue"
import {useEventListener} from "@vueuse/core"

import type {Ref} from "vue"

type UseFileDropOptions = {
  onFileDrop?: (file: File) => void
  onRejectedFile?: (file: File) => void
  accept?: string[]
}

export function useFileDrop(dropZone: Ref<HTMLElement | null>, options: UseFileDropOptions = {}) {
  const isDraggingOver = ref(false)
  const {accept = ["image/*"], onFileDrop, onRejectedFile} = options

  function isAcceptedFile(file: File): boolean {
    return accept.some((type) => {
      if (type === "image/*") return file.type.startsWith("image/")
      if (type.endsWith("/*")) return file.type.startsWith(type.slice(0, -2))
      return file.type === type
    })
  }

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

  useEventListener(dropZone, "drop", async (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    isDraggingOver.value = false

    const files = event.dataTransfer?.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      if (isAcceptedFile(file)) {
        onFileDrop?.(file)
      } else {
        onRejectedFile?.(file)
      }
    }
  })

  return {
    isDraggingOver,
  }
}
