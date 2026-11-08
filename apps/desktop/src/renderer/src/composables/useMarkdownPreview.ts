import {shallowRef, toValue, watch} from "vue"

import {renderMarkdownPreview} from "@/utils/markdown/renderMarkdownPreview"

import type {MarkdownPreviewOptions} from "@/utils/markdown/renderMarkdownPreview"
import type {MaybeRefOrGetter} from "vue"

export function useMarkdownPreview(
  containerRef: MaybeRefOrGetter<HTMLElement | null>,
  content: MaybeRefOrGetter<string>,
  options: MaybeRefOrGetter<MarkdownPreviewOptions>,
) {
  const contentElementRef = shallowRef<HTMLElement | null>(null)

  watch(
    [() => toValue(containerRef), () => toValue(content), () => toValue(options)],
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
