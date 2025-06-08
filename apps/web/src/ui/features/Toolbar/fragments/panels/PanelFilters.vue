<script lang="ts" setup>
import {BaseButton, BaseIcon} from "@daily/ui/base"
import {toFullDate} from "@daily/utils/date"
import {capitalize} from "@daily/utils/strings"

import {computed} from "vue"

import {useDevice} from "@/composables/useDevice"
import {useUIStore} from "@/stores/ui.store"

import type {ISODate} from "@daily/types/date"
import type {TasksFilter} from "@daily/types/filters"
import type {Task} from "@daily/types/tasks"

const props = defineProps<{
  date?: ISODate
  active: TasksFilter
  tasks: Task[]
}>()

const emit = defineEmits<{"update:active": [TasksFilter]}>()

const {isDesktop} = useDevice()
const uiStore = useUIStore()

const options: {label: string; value: TasksFilter}[] = [
  {label: "All", value: "all"},
  {label: "Active", value: "active"},
  {label: "Done", value: "done"},
]

const count = computed(() => {
  return props.tasks.reduce(
    (acc, task) => {
      if (!task.done) acc.active++
      else acc.done++

      return acc
    },
    {active: 0, done: 0},
  )
})

function toggleCalendar() {
  if (isDesktop.value) return
  uiStore.setIsCalendarOpen(!uiStore.isCalendarOpen)
}
</script>
<template>
  <div class="bg-base-100 flex size-full flex-col gap-2 px-4 py-2 md:flex-row md:items-center md:justify-between">
    <div
      class="border-base-300 flex w-full items-center justify-between gap-2 rounded-lg border p-2 pr-4 transition-colors md:w-auto md:cursor-default md:border-none md:bg-transparent md:p-0"
    >
      <template v-if="isDesktop">
        <div class="flex items-center gap-2" @click="toggleCalendar">
          <BaseIcon name="calendar" size="sm" class="flex items-center gap-2" />
          {{ date ? toFullDate(date, {short: true}) : "" }}
        </div>
      </template>
      <template v-else>
        <BaseButton icon="calendar" size="sm" variant="ghost" class="flex items-center gap-2" @click="toggleCalendar">
          {{ date ? toFullDate(date, {short: true}) : "" }}
        </BaseButton>

        <BaseButton variant="ghost" icon="cog" @click="uiStore.toggleIsInfoPanelOpen(true)" />
      </template>
    </div>

    <div class="flex w-full items-center gap-2 md:w-auto">
      <div class="bg-base-300 text-base-content0 inline-flex w-full gap-2 rounded-lg p-0.5 md:w-auto">
        <button
          v-for="option in options"
          :key="option.value"
          class="focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-base-content flex-1 rounded-md px-2 py-0.5 text-sm transition-colors outline-none md:flex-none"
          :class="{
            'bg-base-100 text-base-content shadow-sm': active === option.value,
            'text-base-content/70 hover:text-base-content': active !== option.value,
          }"
          @click="emit('update:active', option.value)"
        >
          {{ capitalize(option.value) }}
          <span v-if="option.value !== 'all'" class="ml-1.5 text-xs"> ({{ count[option.value as keyof typeof count] }}) </span>
        </button>
      </div>
    </div>
  </div>
</template>
