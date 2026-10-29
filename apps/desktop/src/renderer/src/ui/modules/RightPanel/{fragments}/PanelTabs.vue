<script setup lang="ts">
import {computed, nextTick, onMounted, ref, useTemplateRef, watch} from "vue"
import {useResizeObserver} from "@vueuse/core"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {PanelTab} from "../types"

const props = defineProps<{active: PanelTab; commentsCount: number; subtasksCount?: {done: number; total: number} | null}>()

const emit = defineEmits<{select: [PanelTab]}>()

const rootRef = useTemplateRef<HTMLElement>("root")
const tabRefs = useTemplateRef<HTMLElement[]>("tabEls")
const shouldAnimate = ref(false)
const indicator = ref({left: 0, width: 0})

const tabs = computed<{key: PanelTab; label: string; icon: IconName; count?: {text: string; spoken?: string}}[]>(() => [
  {key: "editor", label: "Editor", icon: "pencil"},
  {
    key: "comments",
    label: "Comments",
    icon: "message",
    count: props.commentsCount ? {text: `${props.commentsCount}`} : undefined,
  },
  {key: "history", label: "History", icon: "history"},
  {
    key: "subtasks",
    label: "Subtasks",
    icon: "list-checks",
    count: props.subtasksCount
      ? {text: `${props.subtasksCount.done}/${props.subtasksCount.total}`, spoken: `${props.subtasksCount.done} of ${props.subtasksCount.total}`}
      : undefined,
  },
])

const activeIndex = computed(() =>
  Math.max(
    0,
    tabs.value.findIndex((tab) => tab.key === props.active),
  ),
)

const indicatorStyle = computed(() => ({transform: `translateX(${indicator.value.left}px)`, width: `${indicator.value.width}px`}))

watch([activeIndex, tabs], () => nextTick(measureActiveTab))

useResizeObserver(rootRef, measureActiveTab)

function getTabClasses(isActive: boolean) {
  return cn(
    "focus-visible-accent relative flex h-9 cursor-pointer items-center justify-center gap-1.5 px-2 text-sm font-semibold whitespace-nowrap transition-colors",
    isActive ? "text-base-content" : "text-base-content/50 hover:text-base-content",
    "min-w-0 flex-auto",
  )
}

function getCountClasses(isActive: boolean) {
  return cn(
    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
    isActive ? "bg-base-content/15 text-base-content/80" : "bg-base-content/10 text-base-content/60",
  )
}

function getIndicatorClasses(animate: boolean) {
  return cn("absolute left-0 h-full px-1.5", animate && "transition-all duration-200 ease-out")
}

function measureActiveTab() {
  const el = tabRefs.value?.[activeIndex.value]
  if (el) indicator.value = {left: el.offsetLeft, width: el.offsetWidth}
}

onMounted(() => {
  measureActiveTab()
  requestAnimationFrame(() => (shouldAnimate.value = true))
})
</script>

<template>
  <div ref="root" class="border-base-300 relative flex shrink-0 border-b px-2">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      ref="tabEls"
      :aria-label="tab.count ? `${tab.label}, ${tab.count.spoken ?? tab.count.text}` : tab.label"
      type="button"
      :class="getTabClasses(tab.key === props.active)"
      @click="emit('select', tab.key)"
    >
      <BaseIcon :name="tab.icon" class="size-4 shrink-0" />
      <span class="truncate">{{ tab.label }}</span>
      <span v-if="tab.count" :class="getCountClasses(tab.key === props.active)">{{ tab.count.text }}</span>
    </button>

    <div aria-hidden="true" class="pointer-events-none absolute inset-x-0 -bottom-px h-0.5">
      <div :class="getIndicatorClasses(shouldAnimate)" :style="indicatorStyle">
        <div class="bg-accent h-full rounded-full" />
      </div>
    </div>
  </div>
</template>
