<script setup lang="ts">
import {computed, onMounted, ref} from "vue"
import {useRoute} from "vue-router"
import {useMarkdown} from "@/composables/useMarkdown"
import {useStorageStore} from "@/stores/storage.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {truncate} from "@shared/utils/strings/truncate"

import BaseButton from "@/ui/base/BaseButton.vue"

import FocusTime from "./fragments/FocusTime.vue"
import TimerStats from "./fragments/TimerStats.vue"

// FIXME: Now time update each second what might be a performance issue.

const route = useRoute()
const tasksStore = useTasksStore()
const storageStore = useStorageStore()

useThemeStore()

const {renderMarkdown} = useMarkdown()

const taskId = ref<string | null>(null)

const task = computed(() => tasksStore.findTaskById(taskId.value ?? "") ?? null)

const taskContent = computed(() => truncate(task.value?.content ?? "", 40, "after", "..."))
const isTimerFinished = computed(() => task.value?.status !== "active")

async function onTimerChanged(time: number) {
  if (!task.value) return
  await tasksStore.updateTask(task.value.id, {spentTime: time})
}

function closeWindow() {
  window.BridgeIPC["timer:close"]()
}

onMounted(async () => {
  taskId.value = route.query.taskId as string
})

window.BridgeIPC["tasks:on-task-saved"](async (savedTask) => {
  if (savedTask.id === taskId.value) {
    await storageStore.revalidate()
  }
})

window.BridgeIPC["tasks:on-task-deleted"](async (deletedTaskId) => {
  if (deletedTaskId === taskId.value) closeWindow()
})

window.BridgeIPC["timer:on-refresh"](async (newTaskId) => {
  taskId.value = newTaskId
  await storageStore.revalidate()
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col items-center justify-center gap-6 px-6 pt-2" style="-webkit-app-region: drag">
    <header class="flex w-full items-center justify-between">
      <div class="flex gap-2">
        <span
          v-for="tag in task?.tags.slice(0, 10)"
          class="rounded-md px-2 py-1 text-xs"
          :style="{backgroundColor: `${tag.color}20`, borderColor: `${tag.color}30`}"
        >
          {{ tag.emoji }}
        </span>
      </div>
      <BaseButton variant="ghost" icon="x-mark" class="p-1 opacity-60 hover:opacity-100" style="-webkit-app-region: no-drag" @click="closeWindow" />
    </header>

    <template v-if="task">
      <TimerStats v-if="isTimerFinished" :key="`timer-stats-${task.id}`" :task="task" />
      <FocusTime v-else :key="`timer-${task.id}`" :task="task" @timer-changed="onTimerChanged" />
    </template>

    <footer class="text-base-content/50 pb-4 text-center text-xs" v-html="renderMarkdown(taskContent)" />
  </div>
</template>
