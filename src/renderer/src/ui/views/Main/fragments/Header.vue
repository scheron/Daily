<script setup lang="ts">
import {computed} from "vue"
import {useDevice} from "@/composables/useDevice"
import {toFullDate} from "@/utils/date"
import { tourNotifier } from "@/composables/useTourHelpers"

import BaseButton from "@/ui/base/BaseButton.vue"

const props = defineProps<{taskEditorOpen: boolean; activeDay: string}>()
const emit = defineEmits<{createTask: []; toggleSidebar: []}>()

const {isMobile} = useDevice()

const formattedDate = computed(() => toFullDate(props.activeDay ?? new Date()))

// Handle create task button click
function handleCreateTask() {
  // Notify all active tours
  tourNotifier.notify('task-button-clicked')
  emit('createTask')
}
</script>

<template>
  <div class="border-base-300 h-header flex items-center justify-between border-b px-4 py-2" style="-webkit-app-region: drag">
    <div class="flex items-center gap-2">
      <BaseButton v-if="isMobile" variant="ghost" icon="sidebar" class="ml-16" style="-webkit-app-region: no-drag" @click="emit('toggleSidebar')" />

      <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
        {{ formattedDate }}
      </h1>
    </div>

    <BaseButton
      v-if="!taskEditorOpen"
      data-tour="new-task-button"
      variant="text"
      class="text-accent hover:bg-accent/10 focus-visible-ring focus-visible:ring-accent shrink-0 px-4 py-0"
      icon="plus"
      style="-webkit-app-region: no-drag"
      @click="handleCreateTask"
    >
      New Task
    </BaseButton>
  </div>
</template>
