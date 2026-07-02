<script setup lang="ts" generic="T">
import {computed, ref, useSlots} from "vue"

import BaseCheckbox from "@/ui/base/BaseCheckbox"

import {useCombobox} from "./composables/useCombobox"

const props = withDefaults(
  defineProps<{
    /** All rows; filtering by the search query happens internally. */
    items: readonly T[]
    /** Stable key for each row. */
    itemKey: (item: T) => string | number
    /** Text used to filter and to detect an exact match (for the create footer). */
    filterBy?: (item: T) => string
    /** Whether an item is selected — drives the checkbox prefix (multi-select). */
    selected?: (item: T) => boolean
    /** Show the search input and filter the list. */
    searchable?: boolean
    /** Single-select: no checkbox prefix; selecting a row emits `select` then `close`. */
    single?: boolean
    placeholder?: string
    /** Message shown when there are no items and no footer. */
    emptyText?: string
    /** Focus the search input on mount. */
    autofocus?: boolean
  }>(),
  {
    searchable: true,
    single: false,
    placeholder: "Search...",
    emptyText: "No results",
    autofocus: true,
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
  if (!props.searchable || !props.filterBy || !trimmedQuery.value) return props.items

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

const {
  activeIndex,
  onKeydown: onNavKeydown,
  focus,
} = useCombobox(
  () => ({
    items: filtered.value,
    hasFooter: showFooter.value,
    query: query.value,
    autofocus: props.autofocus,
  }),
  {
    onSelectItem: (index) => {
      const item = filtered.value[index]
      if (item !== undefined) selectItem(item)
    },
    onSelectFooter: () => selectFooter(),
  },
)

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
  if (props.single) emit("close")
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

  onNavKeydown(event)
}

defineExpose({focus})
</script>

<template>
  <div class="flex flex-col">
    <div v-if="searchable" class="border-base-300/70 flex items-center gap-1 border-b px-1.5">
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
        <div
          :data-active="i === activeIndex"
          class="hover:bg-base-200 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
          :class="{'bg-base-200': i === activeIndex}"
          @mouseenter="activeIndex = i"
          @click="selectItem(item)"
        >
          <BaseCheckbox v-if="!single" :model-value="selected ? selected(item) : false" class="pointer-events-none shrink-0" />
          <slot name="item" :item="item" :index="i" :active="i === activeIndex" />
        </div>
      </li>

      <li v-if="showFooter">
        <div
          :data-active="activeIndex === filtered.length"
          class="hover:bg-base-200 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
          :class="{'bg-base-200': activeIndex === filtered.length}"
          @mouseenter="activeIndex = filtered.length"
          @click="selectFooter()"
        >
          <slot name="footer" :active="activeIndex === filtered.length" :query="trimmedQuery" />
        </div>
      </li>

      <li v-if="!filtered.length && !showFooter" class="text-base-content/40 px-2 py-2 text-center text-sm">
        <slot name="empty">{{ emptyText }}</slot>
      </li>
    </ul>
  </div>
</template>
