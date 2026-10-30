<script setup lang="ts">
import {computed, ref, useTemplateRef, watch} from "vue"

import {useBatchedResizeObserver} from "@/composables/useBatchedResizeObserver"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag"
import {fitTagIndices} from "@/utils/tags/fitTagIndices"
import {cn} from "@/utils/ui/tailwindcss"

import type {Tag} from "@daily/protocol"
import type {HTMLAttributes} from "vue"

const props = withDefaults(
  defineProps<{
    tags: Tag[]
    selectable?: boolean
    selectedTags?: Set<Tag["id"]>
    popupHoverMode?: boolean
    size?: "sm" | "md"
    /** Classes for the row wrapping the visible tags and the `+N` popup — the container itself stays unstyled. */
    rowClass?: HTMLAttributes["class"]
  }>(),
  {
    selectedTags: () => new Set(),
    popupHoverMode: false,
    size: "md",
  },
)

const emit = defineEmits<{select: [id: Tag["id"]]}>()

const containerRef = useTemplateRef<HTMLElement>("container")
const probeRef = useTemplateRef<HTMLElement>("probe")
const measureRef = useTemplateRef<HTMLElement>("measure")
const rowRef = useTemplateRef<HTMLElement>("row")
const visibleIndices = ref<number[] | null>(null)

const visibleIndexSet = computed(() => new Set(visibleIndices.value ?? []))
const visibleTags = computed(() => props.tags.filter((_, index) => visibleIndexSet.value.has(index)))
const hiddenTags = computed(() => (visibleIndices.value === null ? [] : props.tags.filter((_, index) => !visibleIndexSet.value.has(index))))
const hasSelectedInPopup = computed(() => hiddenTags.value.some((tag) => props.selectedTags.has(tag.id)))

useBatchedResizeObserver([probeRef, measureRef], {read: readVisibleIndices, write: (indices) => (visibleIndices.value = indices)})

function isActiveTag(id: Tag["id"]) {
  return props.selectedTags.has(id)
}

function onSelectTag(id: Tag["id"]) {
  emit("select", id)
}

function getMoreButtonVariant(hasSelected: boolean) {
  return hasSelected ? "primary" : "text"
}

function getRowClasses() {
  return cn("flex min-w-0 items-center gap-2", props.rowClass)
}

function readVisibleIndices(): number[] {
  if (!containerRef.value || !measureRef.value || !props.tags.length) return props.tags.map((_, index) => index)

  const containerWidth = containerRef.value.offsetWidth
  if (containerWidth === 0) return []

  const rowStyle = rowRef.value ? getComputedStyle(rowRef.value) : null
  const rowInsetWidth = rowStyle
    ? parseFloat(rowStyle.paddingLeft) +
      parseFloat(rowStyle.paddingRight) +
      parseFloat(rowStyle.borderLeftWidth) +
      parseFloat(rowStyle.borderRightWidth)
    : 0
  const availableWidth = containerWidth - rowInsetWidth

  const gap = rowStyle ? parseFloat(rowStyle.columnGap) || 0 : 0
  const widths = Array.from(measureRef.value.children, (element) => (element as HTMLElement).offsetWidth)
  return fitTagIndices(widths, availableWidth, gap, 60)
}

watch(
  () => props.tags,
  () => {
    visibleIndices.value = readVisibleIndices()
  },
  {deep: true, flush: "post"},
)
</script>

<template>
  <div ref="container" class="relative flex w-full min-w-0 items-center gap-2">
    <span v-if="!tags.length" class="text-base-content/70 text-sm">
      <BaseIcon name="tags" class="size-4" />
      No tags
    </span>

    <template v-else>
      <div ref="measure" class="pointer-events-none absolute left-0 top-0 flex items-center gap-2 opacity-0">
        <BaseTag v-for="tag in tags" :key="tag.id" :tag="tag" :active="isActiveTag(tag.id)" :selectable="selectable" :size="size" />
      </div>

      <div ref="row" :class="getRowClasses()">
        <BaseTag
          v-for="tag in visibleTags"
          :key="tag.id"
          :tag="tag"
          :active="isActiveTag(tag.id)"
          :selectable="selectable"
          :size="size"
          style="-webkit-app-region: no-drag"
          @click="onSelectTag(tag.id)"
        />

        <BasePopup v-if="hiddenTags.length" hide-header :hover-mode="popupHoverMode" container-class="min-w-44 p-1" content-class="gap-1.5">
          <template #trigger="{toggle, show}">
            <BaseButton
              :variant="getMoreButtonVariant(hasSelectedInPopup)"
              size="sm"
              icon="tags"
              class="shrink-0 flex-row-reverse"
              style="-webkit-app-region: no-drag"
              @mouseenter="popupHoverMode ? show() : undefined"
              @click.stop="popupHoverMode ? show() : toggle()"
            >
              <span class="font-medium">+{{ hiddenTags.length }}</span>
            </BaseButton>
          </template>

          <BaseTag
            v-for="tag in hiddenTags"
            :key="tag.id"
            :tag="tag"
            :active="isActiveTag(tag.id)"
            :selectable="selectable"
            :size="size"
            class="w-full justify-start text-start"
            @click="onSelectTag(tag.id)"
          />
        </BasePopup>
      </div>

      <div ref="probe" class="absolute inset-x-0 top-0 h-0"></div>
    </template>
  </div>
</template>
