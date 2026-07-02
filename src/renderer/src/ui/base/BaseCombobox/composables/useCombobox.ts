import {nextTick, onMounted, ref, toValue, useTemplateRef, watch} from "vue"

import {sleep} from "@shared/utils/common/sleep"

import type {MaybeRefOrGetter} from "vue"

type ComboboxProps = {
  /** Rows currently rendered (already filtered). */
  items: readonly unknown[]
  /** Whether a navigable footer row follows the items. */
  hasFooter: boolean
  /** Search query; the active row resets to the top whenever it changes. */
  query: string
  /** Focus the search input on mount (defaults to true). */
  autofocus?: boolean
}

type ComboboxEvents = {
  /** Confirms the item at the given index (Enter on a highlighted item, or click). */
  onSelectItem: (index: number) => void
  /** Confirms the footer row (Enter while the footer is highlighted). */
  onSelectFooter?: () => void
}

/**
 * Controller for a combobox: owns the search input and list refs, the active
 * row, arrow/enter navigation (with scroll-into-view), and resets the active
 * row when the query changes. The footer (if present) is the last navigable row.
 *
 * @example
 * const {activeIndex, onKeydown, focus} = useCombobox(props, {
 *   onSelectItem: (i) => emit("select", props.items[i]),
 *   onSelectFooter: () => emit("select-footer"),
 * })
 */
export function useCombobox(rawProps: MaybeRefOrGetter<ComboboxProps>, events: ComboboxEvents) {
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
    } else if (event.key === "Enter") {
      event.preventDefault()
      confirm()
    }
  }

  async function move(delta: number) {
    const count = totalCount()
    if (count <= 0) return

    activeIndex.value = (activeIndex.value + delta + count) % count
    await nextTick()
    listRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({block: "nearest"})
  }

  function confirm() {
    const props = toValue(rawProps)

    if (props.hasFooter && activeIndex.value === props.items.length) {
      events.onSelectFooter?.()
      return
    }

    events.onSelectItem(activeIndex.value)
  }

  function totalCount(): number {
    const props = toValue(rawProps)
    return props.items.length + (props.hasFooter ? 1 : 0)
  }

  watch(
    () => toValue(rawProps).query,
    () => (activeIndex.value = 0),
  )

  onMounted(async () => {
    if (toValue(rawProps).autofocus === false) return
    await sleep(50)
    focus()
  })

  return {activeIndex, inputRef, listRef, onKeydown, focus}
}
