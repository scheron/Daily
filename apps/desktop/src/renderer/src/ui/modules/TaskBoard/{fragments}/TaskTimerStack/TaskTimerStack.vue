<script setup lang="ts">
import {computed, nextTick, ref, useId, useTemplateRef, watch} from "vue"
import {onClickOutside} from "@vueuse/core"
import {storeToRefs} from "pinia"

import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskTimersStore} from "@/stores/task-timers"
import TaskPreviewPopup from "@/ui/common/(misc)/TaskPreviewPopup"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {cn} from "@/utils/ui/tailwindcss"
import TaskTimerPill from "./{fragments}/TaskTimerPill.vue"

import type {Task} from "@daily/protocol"

const previewId = useId()
const listId = useId()

const taskEditorStore = useTaskEditorStore()
const taskTimersStore = useTaskTimersStore()
const {timers} = storeToRefs(taskTimersStore)

const stackRef = useTemplateRef("stack")
const expandButtonRef = useTemplateRef("expandButton")
const isExpanded = ref(false)

const visibleTimers = computed(() => (isExpanded.value ? timers.value : timers.value.slice(0, 1)))
const rearLayerCount = computed(() => Math.min(Math.max(0, timers.value.length - 1), 3))
const stackClass = computed(() => cn({"top-12": isExpanded.value}))
const stackStyle = computed(() => ({"--timer-stack-layers": rearLayerCount.value}))
const listClass = computed(() => cn({"hide-scrollbar overflow-y-auto overscroll-contain": isExpanded.value}))

const {open: confirmLeaveIfDirty} = useConfirmUnsavedModal()
onClickOutside(stackRef, collapse, {ignore: [`[id="${previewId}"]`]})

async function expand(event: MouseEvent) {
  isExpanded.value = true
  if (event.detail !== 0) return

  await nextTick()
  stackRef.value?.querySelector<HTMLElement>("[data-task-timer-open]")?.focus({preventScroll: true})
}

function collapse() {
  isExpanded.value = false
}

async function onEscape(event: KeyboardEvent, hidePreview: () => void) {
  if (event.defaultPrevented || !isExpanded.value) return

  event.preventDefault()
  hidePreview()
  collapse()
  await nextTick()
  expandButtonRef.value?.focus({preventScroll: true})
}

async function onOpen(taskId: Task["id"], hidePreview: () => void) {
  hidePreview()
  if (taskEditorStore.editingTaskId !== taskId) {
    if (!(await confirmLeaveIfDirty())) return
    await taskEditorStore.open(taskId)
  }

  if (taskEditorStore.editingTaskId === taskId) await taskTimersStore.dispatch({type: "promote", taskId})
}

watch(rearLayerCount, (count) => {
  if (count === 0) collapse()
})
</script>

<template>
  <TaskPreviewPopup
    v-if="timers.length"
    v-slot="{taskId, show, leave, hide}"
    :id="previewId"
    :alignment="expandButtonRef"
    :placement="isExpanded ? 'left' : 'top-end'"
  >
    <section
      ref="stack"
      aria-label="Task timers"
      class="timer-stack pointer-events-none absolute bottom-4 right-4 isolate z-20 flex flex-col justify-end [-webkit-app-region:no-drag]"
      :class="stackClass"
      data-task-timer-stack
      :style="stackStyle"
      @keydown.esc="onEscape($event, hide)"
    >
      <template v-if="!isExpanded">
        <span
          v-for="depth in rearLayerCount"
          :key="depth"
          aria-hidden="true"
          class="stack-layer bg-base-200 border-base-300 h-7.5 pointer-events-none absolute rounded-full border"
          :style="{'--timer-layer-depth': depth}"
        />
        <button
          v-if="rearLayerCount"
          ref="expandButton"
          type="button"
          class="stack-grip focus-visible-accent pointer-events-auto absolute inset-x-0 bottom-full cursor-pointer rounded-t-xl outline-none"
          :aria-label="`Expand task timers (${timers.length})`"
          :aria-controls="listId"
          aria-expanded="false"
          @click="expand"
        />
      </template>

      <ol :id="listId" class="pointer-events-auto flex min-h-0 flex-col-reverse gap-1.5" :class="listClass">
        <li v-for="timer in visibleTimers" :key="timer.taskId" class="shrink-0">
          <TaskTimerPill
            :timer="timer"
            :preview-id="previewId"
            :is-preview-visible="taskId === timer.taskId"
            @preview="show"
            @leave-preview="leave"
            @open="onOpen(timer.taskId, hide)"
          />
        </li>
      </ol>
    </section>
  </TaskPreviewPopup>
</template>

<style scoped>
.timer-stack {
  --timer-layer-step: 0.375rem;
}

.timer-stack:has(.stack-grip:is(:hover, :focus-visible)) {
  --timer-layer-step: 0.625rem;
}

.stack-layer {
  z-index: calc(-1 * var(--timer-layer-depth));
  inset-inline: calc(0.25rem * var(--timer-layer-depth));
  bottom: 0;
  transform: translateY(calc(-1 * var(--timer-layer-step) * var(--timer-layer-depth)));
  transition:
    transform 160ms ease-out,
    border-color 160ms ease-out;
}

.timer-stack:has(.stack-grip:is(:hover, :focus-visible)) .stack-layer {
  border-color: color-mix(in srgb, var(--color-accent) 28%, var(--color-base-300));
}

.stack-grip {
  height: calc(var(--timer-layer-step) * var(--timer-stack-layers));
}
</style>
