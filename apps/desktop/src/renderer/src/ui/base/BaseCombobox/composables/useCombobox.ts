import {nextTick, onMounted, ref, useTemplateRef, watch} from "vue"

import {sleep} from "@daily/std"

import type {ComputedRef, Ref} from "vue"

type ComboboxOptions = {
  items: ComputedRef<readonly unknown[]>
  hasFooter: ComputedRef<boolean>
  query: Ref<string>
}

export function useCombobox(options: ComboboxOptions) {
  const activeIndex = ref(0)
  const inputRef = useTemplateRef<HTMLInputElement>("input")
  const listRef = useTemplateRef<HTMLElement>("list")

  function focus() {
    inputRef.value?.focus()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      move(1)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      move(-1)
    }
  }

  async function move(delta: number) {
    const count = totalCount()
    if (count <= 0) return

    activeIndex.value = (activeIndex.value + delta + count) % count
    await nextTick()
    listRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({block: "nearest"})
  }

  function totalCount(): number {
    return options.items.value.length + (options.hasFooter.value ? 1 : 0)
  }

  watch(options.query, () => (activeIndex.value = 0))

  onMounted(async () => {
    await sleep(50)
    focus()
  })

  return {activeIndex, onKeydown}
}
