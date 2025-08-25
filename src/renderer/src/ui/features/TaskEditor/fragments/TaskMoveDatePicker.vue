<script setup lang="ts">
import {ref} from "vue"
import {useTasksStore} from "@/stores/tasks.store"

import type {ISODate} from "@/types/date"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BaseModal from "@/ui/base/BaseModal.vue"

defineProps<{open: boolean}>()
const emit = defineEmits<{"cancel": []; "move-task": [date: ISODate]}>()

const tasksStore = useTasksStore()

const selectedDate = ref<ISODate | null>(null)

function onMoveTask() {
  if (!selectedDate.value) return
  emit("move-task", selectedDate.value)
}

function onCancel() {
  emit("cancel")
}
</script>

<template>
  <BaseModal :open="open" content-class="max-w-md flex flex-col gap-4" container-class="h-auto max-h-[80vh] w-full max-w-md" @close="onCancel">
    <template #header>
      <h3 class="text-xl font-semibold">Move Task to Another Day</h3>
    </template>

    <div class="flex-1 overflow-y-auto">
      <BaseCalendar
        mode="single"
        :days="tasksStore.days"
        :selected-date="selectedDate"
        :initial-month="tasksStore.activeDay"
        size="lg"
        @select-date="selectedDate = $event"
      />
    </div>

    <div class="flex items-center justify-between gap-3">
      <BaseButton variant="ghost" icon="undo" @click="onCancel"> Cancel </BaseButton>
      <BaseButton :disabled="!selectedDate" icon="check" variant="primary" @click="onMoveTask"> Move Task </BaseButton>
    </div>
  </BaseModal>
</template>
