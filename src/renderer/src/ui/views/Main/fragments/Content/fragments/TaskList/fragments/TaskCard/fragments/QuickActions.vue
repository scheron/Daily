<script setup lang="ts">
import {computed, ref, useTemplateRef} from "vue"
import {useProgressFill} from "@/composables/useProgressFill"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {oklchToHex} from "@/utils/colors/oklchToHex"
import {ISODate} from "@shared/types/common"

import BaseButton from "@/ui/base/BaseButton.vue"
import DayPicker from "@/ui/common/pickers/DayPicker.vue"

const emit = defineEmits<{
  edit: []
  "move-date": [date: ISODate]
  delete: []
}>()

const tasksStore = useTasksStore()
const themeStore = useThemeStore()

const deleteButtonRef = useTemplateRef<HTMLDivElement>("deleteButton")

const isOpenDayPicker = ref(false)

const {isFilling} = useProgressFill(deleteButtonRef, {
  color: computed(() => `${oklchToHex(themeStore.currentTheme.colorScheme.error)}60`),
  duration: 500,
  onComplete: () => emit("delete"),
})

function withOpenDayPicker(show: () => void) {
  isOpenDayPicker.value = true
  show()
}
</script>

<template>
  <div
    class="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100"
    :class="[isOpenDayPicker ? 'opacity-100' : 'opacity-0']"
  >
    <div ref="deleteButton" class="size-7 rounded-md">
      <BaseButton
        variant="ghost"
        size="sm"
        tooltip="Hold to delete task"
        icon="trash"
        class="hover:text-error hover:bg-error/10 size-full"
        :class="{'text-error': isFilling}"
        icon-class="size-4"
      />
    </div>

    <DayPicker
      title="Move task to day"
      :days="tasksStore.days"
      :active-day="tasksStore.activeDay"
      @select="emit('move-date', $event)"
      @close="isOpenDayPicker = false"
    >
      <template #trigger="{show}">
        <BaseButton
          variant="ghost"
          size="sm"
          icon="calendar"
          tooltip="Move task to another day"
          class="hover:text-accent hover:bg-accent/10 size-7"
          icon-class="size-5"
          @click="withOpenDayPicker(show)"
        />
      </template>
    </DayPicker>

    <BaseButton
      variant="ghost"
      size="sm"
      icon="pencil"
      class="hover:text-accent hover:bg-accent/10 size-7"
      tooltip="Edit task"
      icon-class="size-4"
      @click="emit('edit')"
    />
  </div>
</template>
