import {useEventListener} from "@vueuse/core"

import type {Ref} from "vue"

type UseClipboardPasteOptions = {
  onTextPaste?: (text: string) => void
  onImagePaste?: (file: File) => void
}

export function useClipboardPaste(contentField: Ref<HTMLElement | null>, options: UseClipboardPasteOptions = {}) {
  function insertNode(node: Node) {
    const sel = window.getSelection()
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (range) {
      range.deleteContents()
      range.insertNode(node)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    } else {
      contentField.value?.appendChild(node)
    }
  }

  function insertText(text: string) {
    const frag = document.createDocumentFragment()
    text.split("\n").forEach((line, i, arr) => {
      frag.appendChild(document.createTextNode(line))
      if (i < arr.length - 1) frag.appendChild(document.createElement("br"))
    })
    insertNode(frag)
  }

  useEventListener(
    contentField,
    "paste",
    async (event: ClipboardEvent) => {
      const el = contentField.value
      const cd = event.clipboardData
      if (!el || !cd) return
      event.preventDefault()

      for (const item of Array.from(cd.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile()
          if (!file) continue
          options.onImagePaste?.(file)
          return
        }
      }

      const text = cd.getData("text/plain")
      if (!text) return
      insertText(text)
      options.onTextPaste?.(text)
    },
    {capture: true},
  )
}
