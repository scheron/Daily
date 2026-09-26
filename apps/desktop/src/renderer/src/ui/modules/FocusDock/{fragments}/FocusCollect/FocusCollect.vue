<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {useFocusStore} from "@/stores/focus.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import {useCardDrop} from "./composables/useCardDrop"
import {useRowReorder} from "./composables/useRowReorder"
import {useClickCommand} from "../../useClickCommand"

import type {FocusMode} from "@shared/types/focus"

const modeOptions: {value: FocusMode; label: string}[] = [
  {value: "pomodoro-25", label: "25 / 5"},
  {value: "pomodoro-50", label: "50 / 10"},
  {value: "timer", label: "Timer"},
]

const focusStore = useFocusStore()

const listRef = useTemplateRef<HTMLElement>("list")

const tasks = computed(() => focusStore.session?.tasks ?? [])

const {dropIndex} = useCardDrop(listRef)
const {draggedIndex, reorderGap, onRowPointerDown} = useRowReorder(listRef)

const lineIndex = computed(() => dropIndex.value ?? reorderGap.value)

const {sendOnClick} = useClickCommand()

function getBoxClasses(isDropping: boolean) {
  return cn(
    "border-base-300 text-base-content/45 flex min-h-24 items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm transition-colors",
    isDropping && "border-accent text-accent",
  )
}

function getRowClasses(isDragged: boolean) {
  return cn("relative flex h-9 cursor-grab items-center gap-2 rounded-lg px-1 select-none", isDragged && "opacity-50")
}

function getModeVariant(isChosen: boolean) {
  return isChosen ? "tertiary" : "ghost-muted"
}
</script>

<template>
  <div v-if="!tasks.length" :class="getBoxClasses(dropIndex !== null)">Drag tasks here from the board</div>

  <ol v-else ref="list" class="flex flex-col gap-1">
    <li
      v-for="(task, index) in tasks"
      :key="task.taskId"
      data-focus-row
      :class="getRowClasses(draggedIndex === index)"
      @pointerdown="onRowPointerDown($event, task.taskId, index)"
    >
      <span v-if="lineIndex === index" data-drop-line class="bg-accent pointer-events-none absolute inset-x-1 -top-[3px] h-0.5 rounded-full" />
      <span class="text-base-content/45 w-3 shrink-0 text-right font-mono text-xs">{{ index + 1 }}</span>
      <BaseIcon name="drag-vertical" class="text-base-content/45 size-4" />
      <span class="min-w-0 flex-1 truncate text-sm">{{ task.title }}</span>
      <BaseButton variant="faint" size="xs" icon="x" @click="sendOnClick($event, {type: 'remove', taskId: task.taskId})" />
      <span
        v-if="lineIndex === tasks.length && index === tasks.length - 1"
        data-drop-line
        class="bg-accent pointer-events-none absolute inset-x-1 -bottom-[3px] h-0.5 rounded-full"
      />
    </li>
  </ol>

  <div class="flex items-center justify-between">
    <span class="text-base-content/55 text-xs font-medium tracking-wide uppercase">Mode</span>
    <div class="bg-base-200 inline-flex rounded-full p-0.5">
      <BaseButton
        v-for="option in modeOptions"
        :key="option.value"
        :variant="getModeVariant(option.value === focusStore.session?.mode)"
        :aria-pressed="option.value === focusStore.session?.mode"
        size="sm"
        @click="focusStore.dispatch({type: 'set-mode', mode: option.value})"
      >
        {{ option.label }}
      </BaseButton>
    </div>
  </div>

  <BaseButton variant="primary" icon="play" size="sm" class="w-full" :disabled="!tasks.length" @click="focusStore.dispatch({type: 'start'})">
    Start
  </BaseButton>
</template>
