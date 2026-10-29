<script setup lang="ts">
import {computed} from "vue"

import {boardColumnForStatus} from "@daily/protocol"

import {TASK_COLUMNS} from "@/constants/ui"
import {useSettingsStore} from "@/stores/settings.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {Task, TaskStatus} from "@daily/protocol"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()
const settingsStore = useSettingsStore()

const boardMode = computed(() => settingsStore.settings?.appearance?.boardMode ?? "normal")
const options = computed(() => TASK_COLUMNS.filter((option) => boardColumnForStatus(option.status, boardMode.value) === option.status))
const activeStatus = computed(() => boardColumnForStatus(props.task.status, boardMode.value))

function selectStatus(status: TaskStatus) {
  if (status !== props.task.status) taskEditorStore.patch({status})
}

function getContainerClasses() {
  return cn("grid items-stretch gap-1", boardMode.value === "agents" ? "grid-cols-3" : "grid-cols-4")
}

function getOptionClasses(isActive: boolean, titleClass: string, counterClass: string) {
  return cn(
    "focus-visible-accent flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors",
    isActive ? counterClass : cn(titleClass, "hover:bg-base-content/5"),
  )
}
</script>

<template>
  <div :class="getContainerClasses()">
    <button
      v-for="option in options"
      :key="option.status"
      type="button"
      :aria-pressed="option.status === activeStatus"
      :title="option.label"
      :class="getOptionClasses(option.status === activeStatus, option.titleClass, option.counterClass)"
      @click="selectStatus(option.status)"
    >
      <BaseIcon :name="option.icon" class="size-4 shrink-0" />
      <span class="truncate">{{ option.label }}</span>
    </button>
  </div>
</template>
