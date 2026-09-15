<script setup lang="ts" generic="T">
import {computed, ref, useSlots} from "vue"

import BaseCheckbox from "@/ui/base/BaseCheckbox.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {useCombobox} from "./composables/useCombobox"

const props = withDefaults(
  defineProps<{
    /** All rows; filtering by the search query happens internally. */
    items: readonly T[]
    itemKey: (item: T) => string | number
    /** Text used to filter and to detect an exact match (for the create footer). */
    filterBy?: (item: T) => string
    /** Whether an item is selected — drives the checkbox prefix. Omit it and no checkbox is rendered. */
    selected?: (item: T) => boolean
    /** Single-select: no checkbox prefix; selecting a row emits `select` then `close`. The footer emits only `select-footer`, so the consumer closes once its create finishes. */
    single?: boolean
    placeholder?: string
    emptyText?: string
  }>(),
  {
    single: false,
    placeholder: "Search...",
    emptyText: "No results",
  },
)

const emit = defineEmits<{
  "update:query": [value: string]
  select: [item: T]
  "select-footer": []
  close: []
  escape: []
  "backspace-empty": []
}>()

const slots = useSlots()

const query = ref("")

const trimmedQuery = computed(() => query.value.trim())
const filtered = computed(() => {
  if (!props.filterBy || !trimmedQuery.value) return props.items

  const filterBy = props.filterBy
  const needle = trimmedQuery.value.toLowerCase()
  return props.items.filter((item) => filterBy(item).toLowerCase().includes(needle))
})

const hasExactMatch = computed(() => {
  if (!props.filterBy || !trimmedQuery.value) return false

  const filterBy = props.filterBy
  const needle = trimmedQuery.value.toLowerCase()
  return props.items.some((item) => filterBy(item).trim().toLowerCase() === needle)
})

const showFooter = computed(() => !!slots.footer && trimmedQuery.value.length > 0 && !hasExactMatch.value)

const {activeIndex, onKeydown: onNavKeydown} = useCombobox({items: filtered, hasFooter: showFooter, query})

function getRowClasses(isActive: boolean) {
  return cn(
    "hover:bg-base-200 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
    isActive && "bg-base-200",
  )
}

function onInput(value: string) {
  query.value = value
  emit("update:query", value)
}

function selectItem(item: T) {
  emit("select", item)
  if (props.single) emit("close")
}

function selectFooter() {
  emit("select-footer")
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation()
    emit("escape")
    return
  }

  if (event.key === "Backspace" && query.value === "") {
    emit("backspace-empty")
    return
  }

  if (event.key === "Enter") {
    event.preventDefault()
    if (showFooter.value && activeIndex.value === filtered.value.length) {
      selectFooter()
      return
    }

    const item = filtered.value[activeIndex.value]
    if (item !== undefined) selectItem(item)
    return
  }

  onNavKeydown(event)
}
</script>

<template>
  <div class="flex flex-col">
    <div class="border-base-300/70 flex items-center gap-1 border-b px-1.5">
      <slot name="prefix" />
      <input
        ref="input"
        :value="query"
        type="text"
        :placeholder="placeholder"
        class="placeholder:text-base-content/40 w-full bg-transparent px-1.5 py-2 text-sm outline-none"
        @input="onInput(($event.target as HTMLInputElement).value)"
        @keydown="onKeydown"
      />
    </div>

    <ul ref="list" class="max-h-60 overflow-y-auto p-1">
      <li v-for="(item, i) in filtered" :key="itemKey(item)">
        <div :data-active="i === activeIndex" :class="getRowClasses(i === activeIndex)" @mouseenter="activeIndex = i" @click="selectItem(item)">
          <BaseCheckbox v-if="!single && selected" :model-value="selected(item)" class="pointer-events-none shrink-0" />
          <slot name="item" :item="item" />
        </div>
      </li>

      <li v-if="showFooter">
        <div
          :data-active="activeIndex === filtered.length"
          :class="getRowClasses(activeIndex === filtered.length)"
          @mouseenter="activeIndex = filtered.length"
          @click="selectFooter()"
        >
          <slot name="footer" :query="trimmedQuery" />
        </div>
      </li>

      <li v-if="!filtered.length && !showFooter" class="text-base-content/40 px-2 py-2 text-center text-sm">{{ emptyText }}</li>
    </ul>
  </div>
</template>
