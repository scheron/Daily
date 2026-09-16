<script setup lang="ts">
import {computed, nextTick, ref, useTemplateRef, watch} from "vue"
import {useResizeObserver} from "@vueuse/core"

import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag"
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
const measureRef = useTemplateRef<HTMLElement>("measure")
const rowRef = useTemplateRef<HTMLElement>("row")
const visibleTags = ref<Tag[]>([])
const hiddenTags = ref<Tag[]>([])

const hasSelectedInPopup = computed(() => hiddenTags.value.some((tag) => props.selectedTags.has(tag.id)))

useResizeObserver(containerRef, calculateVisibleTags)

function isActiveTag(id: Tag["id"]) {
  return props.selectedTags.has(id)
}

function onSelectTag(id: Tag["id"]) {
  emit("select", id)
}

function getMoreButtonClasses(hasSelected: boolean) {
  return cn(
    "h-7 shrink-0 flex-row-reverse rounded-full px-3 py-1.5",
    hasSelected ? "bg-accent/20 border-accent text-accent" : "opacity-70 hover:opacity-90",
  )
}

function getRowClasses() {
  return cn("flex min-w-0 items-center gap-2", props.rowClass)
}

async function calculateVisibleTags() {
  if (!containerRef.value || !measureRef.value || !props.tags.length) {
    visibleTags.value = props.tags
    hiddenTags.value = []
    return
  }

  await nextTick()

  const containerWidth = containerRef.value.offsetWidth
  if (containerWidth === 0) {
    visibleTags.value = []
    hiddenTags.value = props.tags
    return
  }

  const rowStyle = rowRef.value ? getComputedStyle(rowRef.value) : null
  const rowInsetWidth = rowStyle
    ? parseFloat(rowStyle.paddingLeft) +
      parseFloat(rowStyle.paddingRight) +
      parseFloat(rowStyle.borderLeftWidth) +
      parseFloat(rowStyle.borderRightWidth)
    : 0
  const availableWidth = containerWidth - rowInsetWidth

  const tagElements = measureRef.value.children
  const gap = rowStyle ? parseFloat(rowStyle.columnGap) || 0 : 0
  const moreButtonWidth = 60

  let currentWidth = 0
  let visibleCount = 0

  for (let i = 0; i < tagElements.length; i++) {
    const element = tagElements[i] as HTMLElement
    const elementWidth = element.offsetWidth

    const newWidth = currentWidth + (i > 0 ? gap : 0) + elementWidth

    const needsMoreButton = i < props.tags.length - 1
    const totalWidth = newWidth + (needsMoreButton ? gap + moreButtonWidth : 0)

    if (totalWidth > availableWidth) break

    currentWidth = newWidth
    visibleCount++
  }

  visibleTags.value = props.tags.slice(0, visibleCount)
  hiddenTags.value = props.tags.slice(visibleCount)
}

watch(() => props.tags, calculateVisibleTags, {deep: true})
</script>

<template>
  <div ref="container" class="relative flex w-full min-w-0 items-center gap-2">
    <span v-if="!tags.length" class="text-base-content/70 text-sm">
      <BaseIcon name="tags" class="size-4" />
      No tags
    </span>

    <template v-else>
      <div ref="measure" class="pointer-events-none absolute top-0 left-0 flex items-center gap-2 opacity-0">
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
              variant="text"
              :class="getMoreButtonClasses(hasSelectedInPopup)"
              icon="tags"
              icon-class="size-4"
              style="-webkit-app-region: no-drag"
              @mouseenter="popupHoverMode ? show() : undefined"
              @click.stop="popupHoverMode ? show() : toggle()"
            >
              <span class="text-sm font-medium">+{{ hiddenTags.length }}</span>
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
    </template>
  </div>
</template>
