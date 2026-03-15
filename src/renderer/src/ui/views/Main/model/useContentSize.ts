import {computed, ref, useTemplateRef} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

const HEADER_HEIGHT = 62
const FOOTER_HEIGHT = 40

export function useContentSize(contentId: string) {
  const headerHeight = ref(HEADER_HEIGHT)

  const containerRef = useTemplateRef<HTMLDivElement>(contentId)
  const {height, width} = useElementSize(containerRef)

  const footerHeight = FOOTER_HEIGHT
  const contentHeight = computed(() => height.value - headerHeight.value - footerHeight)
  const contentWidth = computed(() => width.value)

  tryOnMounted(() => {
    headerHeight.value = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--header-height"))
  })

  return {contentHeight, contentWidth, headerHeight, footerHeight}
}
