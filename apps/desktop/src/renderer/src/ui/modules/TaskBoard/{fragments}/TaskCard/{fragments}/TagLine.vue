<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef, watch} from "vue"

import {useBatchedResizeObserver} from "@/composables/useBatchedResizeObserver"

import type {Tag} from "@daily/protocol"

const props = defineProps<{tags: Tag[]}>()

const containerRef = useTemplateRef<HTMLElement>("container")
const measureRef = useTemplateRef<HTMLElement>("measure")
const visibleCount = ref<number | null>(null)

const visibleTags = computed(() => (visibleCount.value === null ? props.tags : props.tags.slice(0, visibleCount.value)))
const hiddenTags = computed(() => (visibleCount.value === null ? [] : props.tags.slice(visibleCount.value)))
const hiddenLabel = computed(() => hiddenTags.value.map((tag) => `#${tag.name}`).join(", "))

useBatchedResizeObserver([containerRef, measureRef], {read: readVisibleCount, write: (count) => (visibleCount.value = count)})

function readVisibleCount(): number {
  const MORE_WIDTH = 24
  const GAP = 8

  if (!containerRef.value || !measureRef.value) return props.tags.length

  const width = containerRef.value.offsetWidth
  if (width === 0) return props.tags.length

  const items = measureRef.value.children
  let used = 0
  let count = 0

  for (let i = 0; i < items.length; i++) {
    const next = used + (i > 0 ? GAP : 0) + (items[i] as HTMLElement).offsetWidth
    const reserved = i < items.length - 1 ? GAP + MORE_WIDTH : 0
    if (next + reserved > width) break
    used = next
    count++
  }

  return count
}

watch(
  () => props.tags,
  () => {
    visibleCount.value = readVisibleCount()
  },
  {deep: true, flush: "post"},
)

onMounted(() => {
  visibleCount.value = readVisibleCount()
})
</script>

<template>
  <div ref="container" class="relative flex min-w-0 flex-1 items-center overflow-hidden text-xs">
    <div ref="measure" class="pointer-events-none absolute left-0 top-0 flex items-center gap-2 opacity-0" aria-hidden="true">
      <span v-for="tag in tags" :key="tag.id" class="shrink-0 whitespace-nowrap font-medium">#{{ tag.name }}</span>
    </div>

    <div class="flex w-full min-w-0 items-center gap-2">
      <span v-for="tag in visibleTags" :key="tag.id" class="shrink-0 whitespace-nowrap font-medium" :style="{color: tag.color}">#{{ tag.name }}</span>
      <span v-if="hiddenTags.length" v-tooltip="hiddenLabel" class="text-base-content/55 shrink-0">+{{ hiddenTags.length }}</span>
    </div>
  </div>
</template>
