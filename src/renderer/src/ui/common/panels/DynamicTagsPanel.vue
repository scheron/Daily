<script lang="ts" setup>
import {computed, nextTick, ref, watch} from "vue"
import {useResizeObserver} from "@vueuse/core"

import type {Tag} from "@shared/types/storage"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import BaseTag from "@/ui/base/BaseTag.vue"

const props = withDefaults(
  defineProps<{
    tags: Tag[]
    selectedTags?: Set<Tag["id"]>
    emptyMessage?: string
  }>(),
  {
    selectedTags: () => new Set(),
    emptyMessage: "No tags",
  },
)

const emit = defineEmits<{select: [name: string]}>()

const containerRef = ref<HTMLElement | null>(null)
const tagsRef = ref<HTMLElement | null>(null)
const visibleTags = ref<Tag[]>([])
const hiddenTags = ref<Tag[]>([])

const hasSelectedInPopup = computed(() => hiddenTags.value.some((tag) => props.selectedTags.has(tag.id)))

function isActiveTag(id: Tag["id"]) {
  return props.selectedTags.has(id)
}

function onSelectTag(id: Tag["id"]) {
  emit("select", id)
}

async function calculateVisibleTags() {
  if (!containerRef.value || !tagsRef.value || !props.tags.length) {
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

  const tagElements = tagsRef.value.children
  const gap = 8
  const moreButtonWidth = 60

  let currentWidth = 0
  let visibleCount = 0

  for (let i = 0; i < tagElements.length; i++) {
    const element = tagElements[i] as HTMLElement
    const elementWidth = element.offsetWidth

    const newWidth = currentWidth + (i > 0 ? gap : 0) + elementWidth

    const needsMoreButton = i < props.tags.length - 1
    const totalWidth = newWidth + (needsMoreButton ? gap + moreButtonWidth : 0)

    if (totalWidth > containerWidth) break

    currentWidth = newWidth
    visibleCount++
  }

  visibleTags.value = props.tags.slice(0, visibleCount)
  hiddenTags.value = props.tags.slice(visibleCount)
}

watch(() => props.tags, calculateVisibleTags, {deep: true})
useResizeObserver(containerRef, calculateVisibleTags)
</script>

<template>
  <div ref="containerRef" class="relative flex w-full items-center gap-2">
    <span v-if="!tags.length" class="text-base-content/70 text-sm">
      <BaseIcon name="tags" class="size-4" />
      {{ emptyMessage }}
    </span>

    <template v-else>
      <div ref="tagsRef" class="pointer-events-none absolute top-0 left-0 flex items-center gap-2 opacity-0">
        <BaseTag v-for="tag in tags" :key="tag.id" :tag="tag" :active="isActiveTag(tag.id)" />
      </div>

      <BaseTag v-for="tag in visibleTags" :key="tag.id" :tag="tag" :active="isActiveTag(tag.id)" @click="onSelectTag(tag.id)" />

      <BasePopup v-if="hiddenTags.length" title="More Tags">
        <template #trigger="{toggle}">
          <BaseButton
            variant="outline"
            size="sm"
            class="shrink-0 rounded-md px-2"
            :class="[hasSelectedInPopup ? 'bg-accent/20 border-accent text-accent' : 'opacity-70 hover:opacity-90']"
            icon="tags"
            icon-class="size-3.5"
            @click="toggle"
          >
            <span class="text-xs font-medium">{{ hiddenTags.length }}</span>
          </BaseButton>
        </template>

        <BaseButton
          v-for="tag in hiddenTags"
          :key="tag.id"
          variant="ghost"
          size="sm"
          class="w-full gap-0"
          icon-class="size-4"
          :class="isActiveTag(tag.id) ? 'bg-base-200' : ''"
          @click="onSelectTag(tag.id)"
        >
          <span class="mr-2 size-3 shrink-0 rounded-full" :style="{backgroundColor: tag.color}" />
          <span v-if="tag.emoji" class="mr-1 text-xs">{{ tag.emoji }}</span>
          <span v-else class="text-base leading-0">#</span>
          <span class="truncate text-sm">{{ tag.name }}</span>
          <BaseIcon name="check" class="text-base-content/70 ml-auto size-4 shrink-0" :class="{invisible: !isActiveTag(tag.id)}" />
        </BaseButton>
      </BasePopup>
    </template>
  </div>
</template>
