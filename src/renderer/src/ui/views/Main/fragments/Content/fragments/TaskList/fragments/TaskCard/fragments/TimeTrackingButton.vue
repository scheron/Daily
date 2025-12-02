<script setup lang="ts">
import {computed, ref} from "vue"
import {useTasksStore} from "@/stores/tasks.store"
import {toDurationLabel} from "@shared/utils/date/formatters"

import type {Task} from "@shared/types/storage"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"
import NumberInput from "@/ui/common/inputs/NumberInput.vue"

const props = defineProps<{task: Task}>()

const tasksStore = useTasksStore()

const isCompleted = computed(() => props.task.status === "done" || props.task.status === "discarded")
const isEstimated = computed(() => props.task.estimatedTime > 0)

const customHours = ref(0)
const customMinutes = ref(0)

const progress = computed(() => calcProgress(props.task.spentTime, props.task.estimatedTime))

function calcProgress(current: number, total: number) {
  return Math.min(Math.round((current / total) * 100), 100)
}

async function addTime(minutes: number) {
  const secondsToAdd = minutes * 60
  const newSpentTime = props.task.spentTime + secondsToAdd
  await tasksStore.updateTask(props.task.id, {spentTime: newSpentTime})
}

async function subtractTime(minutes: number) {
  const secondsToSubtract = minutes * 60
  const newSpentTime = Math.max(0, props.task.spentTime - secondsToSubtract)
  await tasksStore.updateTask(props.task.id, {spentTime: newSpentTime})
}

async function addCustomTime() {
  const totalMinutes = customHours.value * 60 + customMinutes.value
  if (totalMinutes === 0) return

  await addTime(totalMinutes)
  customHours.value = 0
  customMinutes.value = 0
}

async function subtractCustomTime() {
  const totalMinutes = customHours.value * 60 + customMinutes.value
  if (totalMinutes === 0) return

  await subtractTime(totalMinutes)
  customHours.value = 0
  customMinutes.value = 0
}

const timeDifference = computed(() => {
  const diff = props.task.spentTime - props.task.estimatedTime
  const absDiff = Math.abs(diff)
  const hours = Math.floor(absDiff / 3600)
  const minutes = Math.floor((absDiff % 3600) / 60)

  let timeStr = ""
  if (hours > 0) timeStr += `${hours}h `
  if (minutes > 0 || hours === 0) timeStr += `${minutes}m`

  return {
    isOver: diff > 0,
    isUnder: diff < 0,
    display: timeStr.trim(),
    raw: diff,
  }
})
</script>

<template>
  <BasePopup v-if="task.estimatedTime > 0" hide-header container-class="p-0 min-w-72" position="end" content-class="p-3">
    <template #trigger="{toggle}">
      <div
        v-if="isEstimated"
        v-tooltip="{content: task.status === 'active' ? 'Open time tracking' : 'Check time tracking', placement: 'bottom-end'}"
        class="relative flex h-7 shrink-0 items-center gap-1 overflow-hidden rounded-md border px-3 py-1 text-xs transition-colors duration-200"
        :class="{
          'text-accent border-accent/20 hover:border-accent/40 hover:bg-accent/20': task.status === 'active',
          'text-success bg-success/10 border-success/20 hover:bg-success/20': task.status === 'done',
          'text-warning bg-warning/10 border-warning/20 hover:bg-warning/20': task.status === 'discarded',
        }"
        @click="toggle"
      >
        <div
          v-if="task.status === 'active'"
          class="bg-accent/20 absolute top-0 left-0 h-full transition-all duration-200 ease-in-out"
          :style="{width: `${progress}%`}"
        ></div>

        <BaseIcon :name="task.status === 'active' ? 'stopwatch' : 'check-check'" class="size-4" />
        <span class="tracking-wide">
          {{ task.status === "active" ? toDurationLabel(props.task.estimatedTime) : toDurationLabel(props.task.spentTime) }}
        </span>
      </div>
    </template>

    <div class="flex flex-col gap-3">
      <div class="flex w-full flex-col items-center gap-1 text-xs">
        <div class="flex w-full items-center justify-between gap-1">
          <span class="text-base-content/40">Estimated</span>
          <span class="text-base-content font-mono font-bold">{{ toDurationLabel(props.task.estimatedTime) }}</span>
        </div>

        <div class="flex w-full items-center justify-between gap-1">
          <span class="text-base-content/40">Spent</span>
          <span class="font-mono font-bold">{{ toDurationLabel(props.task.spentTime) }}</span>
        </div>

        <div v-if="timeDifference.raw && isCompleted" class="flex w-full items-center justify-between gap-1">
          <span class="text-base-content/40">{{ timeDifference.isOver ? "Overtime" : "Left" }}</span>
          <span :class="timeDifference.isOver ? 'text-error' : 'text-success'" class="font-mono font-bold">
            {{ toDurationLabel(Math.abs(timeDifference.raw)) }}
          </span>
        </div>
      </div>

      <template v-if="!isCompleted">
        <div class="grid grid-cols-4 gap-1.5">
          <BaseButton size="sm" class="bg-success/10 hover:bg-success/20 text-success border-success/20 border px-2 py-1" @click="addTime(15)">
            <span class="font-mono text-xs">+15m</span>
          </BaseButton>
          <BaseButton size="sm" class="bg-success/10 hover:bg-success/20 text-success border-success/20 border px-2 py-1" @click="addTime(30)">
            <span class="font-mono text-xs">+30m</span>
          </BaseButton>
          <BaseButton size="sm" class="bg-success/10 hover:bg-success/20 text-success border-success/20 border px-2 py-1" @click="addTime(60)">
            <span class="font-mono text-xs">+1h</span>
          </BaseButton>
          <BaseButton size="sm" class="bg-success/10 hover:bg-success/20 text-success border-success/20 border px-2 py-1" @click="addTime(120)">
            <span class="font-mono text-xs">+2h</span>
          </BaseButton>
          <BaseButton size="sm" class="bg-error/10 hover:bg-error/20 text-error border-error/20 border px-2 py-1" @click="subtractTime(15)">
            <span class="font-mono text-xs">-15m</span>
          </BaseButton>
          <BaseButton size="sm" class="bg-error/10 hover:bg-error/20 text-error border-error/20 border px-2 py-1" @click="subtractTime(30)">
            <span class="font-mono text-xs">-30m</span>
          </BaseButton>
          <BaseButton size="sm" class="bg-error/10 hover:bg-error/20 text-error border-error/20 border px-2 py-1" @click="subtractTime(60)">
            <span class="font-mono text-xs">-1h</span>
          </BaseButton>
          <BaseButton size="sm" class="bg-error/10 hover:bg-error/20 text-error border-error/20 border px-2 py-1" @click="subtractTime(120)">
            <span class="font-mono text-xs">-2h</span>
          </BaseButton>
        </div>

        <div class="border-base-300 flex items-center gap-1.5 rounded border px-2 py-1.5">
          <NumberInput v-model="customHours" :max="23" placeholder="0" />
          <span class="text-base-content/50 text-xs">h</span>

          <NumberInput v-model="customMinutes" :max="59" placeholder="0" />
          <span class="text-base-content/50 text-xs">m</span>

          <div class="ml-auto flex items-center gap-1">
            <BaseButton size="sm" icon="plus" variant="ghost" class="hover:bg-success/20 text-success h-6 w-6 p-0" @click="addCustomTime" />
            <BaseButton size="sm" icon="minus" variant="ghost" class="hover:bg-error/20 text-error h-6 w-6 p-0" @click="subtractCustomTime" />
          </div>
        </div>
      </template>
    </div>
  </BasePopup>
</template>
