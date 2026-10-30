<script setup lang="ts">
import {computed, onMounted, ref, useTemplateRef, watch} from "vue"

import {useBatchedResizeObserver} from "@/composables/useBatchedResizeObserver"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag"
import {fitTagIndices} from "@/utils/tags/fitTagIndices"

import type {Tag} from "@daily/protocol"

const props = defineProps<{tags: Tag[]}>()

const containerRef = useTemplateRef<HTMLElement>("container")
const measureRef = useTemplateRef<HTMLElement>("measure")
const visibleIndices = ref<number[] | null>(null)

const visibleTags = computed(() => props.tags.filter((_, index) => visibleIndices.value === null || visibleIndices.value.includes(index)))
const hiddenTags = computed(() => props.tags.filter((_, index) => visibleIndices.value !== null && !visibleIndices.value.includes(index)))

useBatchedResizeObserver([containerRef, measureRef], {read: readVisibleIndices, write: (indices) => (visibleIndices.value = indices)})

function onTriggerBlur(event: FocusEvent, hide: () => void) {
  if (event.relatedTarget) hide()
}

function readVisibleIndices(): number[] {
  if (!containerRef.value || !measureRef.value) return props.tags.map((_, index) => index)

  const width = containerRef.value.offsetWidth
  if (width === 0) return props.tags.map((_, index) => index)

  const widths = Array.from(measureRef.value.children, (element) => (element as HTMLElement).offsetWidth)
  return fitTagIndices(widths, width, 8, 24)
}

watch(
  () => props.tags,
  () => {
    visibleIndices.value = readVisibleIndices()
  },
  {deep: true, flush: "post"},
)

onMounted(() => {
  visibleIndices.value = readVisibleIndices()
})
</script>

<template>
  <div ref="container" class="relative flex min-w-0 flex-1 items-center overflow-hidden text-xs">
    <div ref="measure" class="pointer-events-none absolute left-0 top-0 flex items-center gap-2 opacity-0" aria-hidden="true">
      <span v-for="tag in tags" :key="tag.id" class="shrink-0 whitespace-nowrap font-medium">#{{ tag.name }}</span>
    </div>

    <div class="flex w-full min-w-0 items-center gap-2">
      <span v-for="tag in visibleTags" :key="tag.id" class="shrink-0 whitespace-nowrap font-medium" :style="{color: tag.color}">#{{ tag.name }}</span>
      <BasePopup
        v-if="hiddenTags.length"
        hide-header
        hover-mode
        trigger-class="shrink-0"
        container-class="min-w-44 max-w-[calc(100vw-1rem)] p-1"
        content-class="gap-1.5"
      >
        <template #trigger="{show, hide}">
          <button
            type="button"
            class="text-base-content/55 focus-visible-accent outline-none"
            :aria-label="`Show ${hiddenTags.length} more tags`"
            @mouseenter="show"
            @focus="show"
            @blur="onTriggerBlur($event, hide)"
            @keydown.esc.stop="hide"
            @click.stop="show"
          >
            +{{ hiddenTags.length }}
          </button>
        </template>

        <BaseTag v-for="tag in hiddenTags" :key="tag.id" :tag="tag" disabled class="w-full cursor-default justify-start text-start" />
      </BasePopup>
    </div>
  </div>
</template>
