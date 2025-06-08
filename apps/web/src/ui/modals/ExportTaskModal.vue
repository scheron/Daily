<script setup lang="ts">
import {BaseButton, BaseModal} from "@daily/ui/base"
import BaseCalendar, {PRESETS} from "@/ui/base/BaseCalendar"
import {Logo} from "@daily/ui/misc"
import {prepareTasksForExport} from "@daily/utils/markdown"

import {computed, ref} from "vue"
import {toast} from "vue-sonner"
import {DateTime} from "luxon"

import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"

import type {ISODate} from "@daily/types/date"
import type {CalendarPreset, DateRange} from "@/ui/base/BaseCalendar"

const selectedRange = ref<DateRange>({start: null, end: null})

const uiStore = useUIStore()
const tasksStore = useTasksStore()

function onClose() {
  uiStore.toggleIsExportTaskOpen(false)
}

function formatDate(isoDate: ISODate): string {
  return DateTime.fromISO(isoDate).toFormat("yyyy-MM-dd")
}

const canExport = computed(() => selectedRange.value.start && selectedRange.value.end)
const formattedDateRange = computed(() => {
  if (!selectedRange.value.start || !selectedRange.value.end) return null

  const startFormatted = formatDate(selectedRange.value.start)
  const endFormatted = formatDate(selectedRange.value.end)

  return selectedRange.value.start === selectedRange.value.end ? startFormatted : `${startFormatted} — ${endFormatted}`
})

function updateRange(range: DateRange): void {
  selectedRange.value = range
}

function selectPreset(preset: CalendarPreset): void {
  selectedRange.value = preset.getValue()
}

async function handleExport() {
  if (!selectedRange.value.start || !selectedRange.value.end) return

  const exportData = prepareTasksForExport({
    fromDate: selectedRange.value.start,
    toDate: selectedRange.value.end,
    days: tasksStore.days,
  })

  if (!exportData.length) {
    toast.error("No tasks found in the selected date range")
    return
  }

  // const result = await window.electronAPI.exportData(exportData)

  // if (result) {
    // const totalTasks = exportData.reduce((sum, day) => sum + day.tasks.length, 0)
    // toast.success(`${totalTasks} tasks exported successfully across ${exportData.length} days`)
  // } else {
    // toast.error("Failed to export tasks")
  // }

  onClose()
}
</script>

<template>
  <BaseModal
    :open="uiStore.isExportTaskOpen"
    container-class="h-full m-8 w-full h-[680px] w-[500px]"
    content-class="!p-0 flex flex-col"
    @close="onClose"
  >
    <template #header>
      <div class="text-accent flex items-center gap-2 select-none">
        <Logo class="h-5" />
        <h2 class="font-mono text-lg font-bold">Export tasks</h2>
      </div>
    </template>

    <div class="flex-1 overflow-y-auto p-4">
      <div class="flex h-full flex-col gap-4">
        <BaseCalendar mode="range" :days="tasksStore.days" :selected-range="selectedRange" size="lg" @update-range="updateRange" />

        <div class="border-accent/10 my-1 border-b" />

        <div class="hide-scrollbar flex w-full flex-shrink-0 gap-2 overflow-x-auto">
          <BaseButton
            v-for="preset in PRESETS"
            :key="preset.label"
            variant="ghost"
            size="sm"
            class="w-full m-1 min-w-fit select-none"
            @click="selectPreset(preset)"
          >
            {{ preset.label }}
          </BaseButton>
        </div>
      </div>
    </div>

    <div class="border-base-300 flex items-center justify-between border-t p-4">
      <div class="text-base-content text-sm">
        {{ formattedDateRange }}
      </div>

      <div class="flex gap-3">
        <BaseButton variant="text" @click="onClose"> Cancel </BaseButton>
        <BaseButton variant="primary" :disabled="!canExport" @click="handleExport"> Export </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
