<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"
import type {PanelTab} from "../types"

const props = defineProps<{active: PanelTab; compact?: boolean}>()

const emit = defineEmits<{select: [PanelTab]}>()

const tabs = computed<{key: PanelTab; label: string; icon: IconName}[]>(() => [
  {key: "editor", label: "Editor", icon: "pencil"},
  {key: "history", label: "History", icon: "history"},
])

function getTabClasses(isActive: boolean) {
  return cn(
    "focus-visible-accent relative flex h-9 min-w-0 flex-1 basis-0 cursor-pointer items-center justify-center gap-1.5 px-1 text-sm font-semibold transition-colors",
    "after:absolute after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full",
    isActive ? "text-base-content after:bg-accent" : "text-base-content/50 hover:text-base-content",
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
    </button>
  </div>
</template>
