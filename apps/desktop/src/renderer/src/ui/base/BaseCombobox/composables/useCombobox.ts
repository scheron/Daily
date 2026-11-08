import {nextTick, onMounted, ref, toValue, watch} from "vue"

import {sleep} from "@daily/std"

import type {MaybeRefOrGetter} from "vue"

type ComboboxOptions = {
  items: MaybeRefOrGetter<readonly unknown[]>
  hasFooter: MaybeRefOrGetter<boolean>
  query: MaybeRefOrGetter<string>
  inputRef: MaybeRefOrGetter<HTMLInputElement | null>
  listRef: MaybeRefOrGetter<HTMLElement | null>
}

export function useCombobox(options: ComboboxOptions) {
  const activeIndex = ref(0)

  function focus() {
    toValue(options.inputRef)?.focus()
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
    toValue(options.listRef)?.querySelector('[data-active="true"]')?.scrollIntoView({block: "nearest"})
  }

  function totalCount(): number {
    return toValue(options.items).length + (toValue(options.hasFooter) ? 1 : 0)
  }

  watch(
    () => toValue(options.query),
    () => (activeIndex.value = 0),
  )

  onMounted(async () => {
    await sleep(50)
    focus()
  })

  return {activeIndex, onKeydown}
}
