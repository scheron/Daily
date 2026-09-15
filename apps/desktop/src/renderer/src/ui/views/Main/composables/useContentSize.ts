import {computed, ref} from "vue"
import {tryOnMounted, useElementSize} from "@vueuse/core"

import {getCssVariable} from "@/utils/ui/dom"

import type {ShallowRef} from "vue"

export function useContentSize(container: Readonly<ShallowRef<HTMLElement | null>>) {
  const headerHeight = ref(parseFloat(getCssVariable("--header-height") || "44"))

  const {height} = useElementSize(container)

  const contentHeight = computed(() => height.value - headerHeight.value)

  tryOnMounted(() => {
    headerHeight.value = parseFloat(getCssVariable("--header-height"))
  })

  return {contentHeight}
}
