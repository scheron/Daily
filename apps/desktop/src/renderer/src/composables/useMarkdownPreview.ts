import {shallowRef, watch} from "vue"

import {renderMarkdownPreview} from "@/utils/markdown/renderMarkdownPreview"

import type {MarkdownPreviewOptions} from "@/utils/markdown/renderMarkdownPreview"
import type {Ref} from "vue"

export function useMarkdownPreview(
  containerRef: Readonly<Ref<HTMLElement | null>>,
  content: Readonly<Ref<string>>,
  options: Readonly<Ref<MarkdownPreviewOptions>>,
) {
  const contentElementRef = shallowRef<HTMLElement | null>(null)

  watch(
    [containerRef, content, options],
    ([container, source, previewOptions], _, onCleanup) => {
      if (!container) {
        contentElementRef.value = null
        return
      }

      let active = true
      onCleanup(() => {
        active = false
      })
      render(container)

      function render(target: HTMLElement) {
        const preview = renderMarkdownPreview(source, previewOptions)
        target.replaceChildren(preview.element)
        contentElementRef.value = preview.element.querySelector(".markdown-preview-content")
        void preview.languagesLoaded?.then(() => {
          if (active) render(target)
        })
      }
    },
    {immediate: true},
  )

  return contentElementRef
}
