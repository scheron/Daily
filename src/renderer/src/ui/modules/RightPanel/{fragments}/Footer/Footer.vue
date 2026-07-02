<script setup lang="ts">
import {computed} from "vue"
import {toasts} from "vue-toasts-lite"

import {toRelativeTime} from "@shared/utils/date/formatters"
import {useTasksStore} from "@/stores/tasks"
import {TASK_EVENT_META} from "@/constants/taskEvents"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import Spacer from "@/ui/common/misc/Spacer.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"

import {useTaskEditor} from "../../composables/useTaskEditor"
import {useTaskHistory} from "./composables/useTaskHistory"
import TaskHistoryTimeline from "./{fragments}/TaskHistoryTimeline.vue"

const {isEditing, editingTaskId, close} = useTaskEditor()
const tasksStore = useTasksStore()

const historyTask = computed(() => (editingTaskId.value ? tasksStore.findTaskById(editingTaskId.value) : null))
const {events, isEmpty, lastEvent} = useTaskHistory(historyTask)

const summary = computed(() => {
  if (!lastEvent.value) return null
  return `${TASK_EVENT_META[lastEvent.value.type].verb} ${toRelativeTime(lastEvent.value.createdAt)}`
})

async function onDelete() {
  if (!editingTaskId.value) return
  const deleted = await tasksStore.deleteTask(editingTaskId.value)
  if (deleted) {
    toasts.success("Task deleted")
    close()
  }
}
</script>

<template>
  <div v-if="historyTask && isEditing" class="border-base-300 text-base-content/60 flex h-10 items-center border-t px-4">
    <BasePopup
      v-if="!isEmpty"
      hover-mode
      side="top"
      position="start"
      hide-header
      container-class="w-72 max-h-80 overflow-y-auto p-0"
      trigger-class="h-full text-base-content/60 hover:text-base-content cursor-default  text-xs"
    >
      <template #trigger="{show}">
        <div class="flex h-full items-center gap-1.5" @mouseenter="show">
          <BaseIcon name="history" class="size-3.5" />
          {{ summary }}
        </div>
      </template>

      <TaskHistoryTimeline :events="events" />
    </BasePopup>
    <Spacer />

    <ConfirmPopup
      title="Delete task?"
      message="This task will be moved to trash."
      confirm-text="Delete"
      cancel-text="Cancel"
      position="end"
      content-class="max-w-72"
      @confirm="onDelete"
    >
      <template #trigger="{show}">
        <BaseButton variant="ghost" icon="trash" icon-class="size-4.5" size="sm" class="text-error hover:bg-error/10" @click="show" />
      </template>
    </ConfirmPopup>
  </div>
</template>
