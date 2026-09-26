<script setup lang="ts">
import {toDurationLabel} from "@daily/std"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {FocusSessionTask} from "@shared/types/focus"

defineProps<{tasks: FocusSessionTask[]; shouldShowFocusTime?: boolean}>()

function getTitleClasses(isDone: boolean) {
  return cn("min-w-0 flex-1 truncate text-sm", isDone && "text-base-content/50 line-through")
}

function getTimeClasses(hasTime: boolean) {
  return cn("text-base-content/30 shrink-0 text-xs", hasTime && "text-base-content/55")
}
</script>

<template>
  <ul class="flex flex-col gap-0.5">
    <li v-for="task in tasks" :key="task.taskId" class="flex h-8 items-center gap-2.5 px-0.5">
      <span class="flex size-4.5 shrink-0 items-center justify-center">
        <BaseIcon v-if="task.isDone" name="check" class="text-success size-3.5" />
        <span v-else class="border-base-content/30 size-2.5 rounded-full border" />
      </span>
      <span :class="getTitleClasses(task.isDone)">{{ task.title }}</span>
      <span v-if="shouldShowFocusTime" :class="getTimeClasses(task.focusedSeconds > 0)">{{ toDurationLabel(task.focusedSeconds, "—") }}</span>
    </li>
  </ul>
</template>
