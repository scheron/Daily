<script setup lang="ts">
import {computed, ref} from "vue"

import {toDurationLabel} from "@daily/std"

import {useTaskEditorStore} from "@/stores/task-editor"
import {useTaskTimersStore} from "@/stores/task-timers"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import EstimationPicker from "@/ui/common/(pickers)/EstimationPicker"
import PropertyCell from "../PropertyCell.vue"

import type {Task} from "@daily/protocol"

type TimeField = "estimatedTime" | "spentTime"

const props = defineProps<{task: Task}>()

const taskEditorStore = useTaskEditorStore()
const taskTimersStore = useTaskTimersStore()
const tasksStore = useTasksStore()

const activeField = ref<TimeField>("estimatedTime")

const estimateVariant = computed(() => (activeField.value === "estimatedTime" ? "primary" : "ghost-muted"))
const spentVariant = computed(() => (activeField.value === "spentTime" ? "primary" : "ghost-muted"))
const isEmpty = computed(() => props.task.estimatedTime === 0 && props.task.spentTime === 0)
const timeLabel = computed(() => {
  if (isEmpty.value) return "Set estimate"
  return `${toDurationLabel(props.task.estimatedTime, "—")} / ${toDurationLabel(props.task.spentTime, "—")}`
})
const canStartTimer = computed(() => {
  const taskId = taskEditorStore.editingTaskId
  if (taskId === null || props.task.status === "done" || tasksStore.findTaskById(taskId)?.status === "done") return false
  return !taskTimersStore.timers.some((timer) => timer.taskId === taskId)
})
const isTimerPending = computed(() => taskEditorStore.editingTaskId !== null && taskTimersStore.isPending(taskEditorStore.editingTaskId))

function patchTime(total: number) {
  taskEditorStore.patch({[activeField.value]: total})
}

async function startTimer(hide: () => void) {
  const taskId = taskEditorStore.editingTaskId
  if (taskId === null || !canStartTimer.value) return

  const started = await taskTimersStore.dispatch({type: "start", taskId})
  if (started && taskEditorStore.editingTaskId === taskId) hide()
}
</script>

<template>
  <BasePopup position="start">
    <template #trigger="{toggle}">
      <PropertyCell :label="timeLabel" :is-empty="isEmpty" @click="toggle">
        <template #icon>
          <BaseIcon name="stopwatch" class="size-4" />
        </template>
      </PropertyCell>
    </template>

    <template #default="{hide}">
      <div class="flex w-64 flex-col gap-2" @click.stop>
        <div class="flex items-center gap-1">
          <BaseButton :variant="estimateVariant" icon="stopwatch" size="sm" class="flex-1" @click="activeField = 'estimatedTime'">
            Estimate
          </BaseButton>

          <BaseButton :variant="spentVariant" icon="check-check" size="sm" class="flex-1" @click="activeField = 'spentTime'"> Spent </BaseButton>
        </div>

        <EstimationPicker :model-value="task[activeField]" @update:model-value="patchTime" />

        <BaseButton
          v-if="activeField === 'spentTime' && taskEditorStore.editingTaskId !== null"
          variant="primary"
          size="sm"
          icon="play"
          :disabled="!canStartTimer"
          :loading="isTimerPending"
          @click="startTimer(hide)"
        >
          Timer
        </BaseButton>
      </div>
    </template>
  </BasePopup>
</template>
