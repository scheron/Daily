<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {PanelTab} from "../types"

const props = defineProps<{active: PanelTab; commentsCount: number; compact?: boolean}>()

const emit = defineEmits<{select: [PanelTab]}>()

const tabs = computed<{key: PanelTab; label: string; icon: IconName; count?: number}[]>(() => [
  {key: "editor", label: "Editor", icon: "pencil"},
  {key: "comments", label: "Comments", icon: "message", count: props.commentsCount},
  {key: "history", label: "History", icon: "history"},
])

function getTabClasses(isActive: boolean) {
  return cn(
    "focus-visible-accent relative flex h-9 min-w-0 flex-1 basis-0 cursor-pointer items-center justify-center gap-1.5 px-1 text-sm font-semibold transition-colors",
    "after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full",
    isActive ? "text-base-content after:bg-accent" : "text-base-content/50 hover:text-base-content",
  )
}

function getCountClasses(isActive: boolean) {
  return cn(
    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
    isActive ? "bg-base-content/15 text-base-content/80" : "bg-base-content/10 text-base-content/60",
  )
}
</script>

<template>
  <div class="border-base-300 flex shrink-0 border-b px-2">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      v-tooltip="props.compact ? tab.label : ''"
      type="button"
      :class="getTabClasses(tab.key === props.active)"
      @click="emit('select', tab.key)"
    >
      <BaseIcon v-if="!props.compact" :name="tab.icon" class="size-4 shrink-0" />
      <span class="min-w-0 truncate">{{ tab.label }}</span>
      <span v-if="tab.count" :class="getCountClasses(tab.key === props.active)">{{ tab.count }}</span>
    </button>
  </div>
</template>
