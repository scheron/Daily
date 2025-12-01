<script setup lang="ts">
import {computed} from "vue"
import {useDevice} from "@/composables/useDevice"
import {toFullDate} from "@shared/utils/date/formatters"

import BaseButton from "@/ui/base/BaseButton.vue"
import {useUIStore} from "@/ui/views/Main/model/ui.store"

const props = defineProps<{taskEditorOpen: boolean; activeDay: string}>()
const emit = defineEmits<{createTask: []; toggleSidebar: []}>()

const {isMobile, isDesktop} = useDevice()
const uiStore = useUIStore()

const formattedDate = computed(() => toFullDate(props.activeDay ?? new Date()))

const showToggleButton = computed(() => {
  if (isDesktop.value) return uiStore.isSidebarCollapsed
  return true
})
</script>

<template>
  <div class="border-base-300 h-header flex items-center justify-between border-b px-4 py-2" style="-webkit-app-region: drag">
    <div class="flex items-center gap-2">
      <BaseButton
        v-if="showToggleButton"
        variant="ghost"
        icon="sidebar"
        :tooltip="isDesktop ? 'Expand Sidebar' : 'Toggle Sidebar'"
        :class="{'ml-16': isMobile}"
        style="-webkit-app-region: no-drag"
        @click="emit('toggleSidebar')"
      />

      <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
        {{ formattedDate }}
      </h1>
    </div>

    <BaseButton
      v-if="!taskEditorOpen"
      variant="text"
      class="text-accent hover:bg-accent/10 focus-visible-ring focus-visible:ring-accent shrink-0 px-4 py-0"
      icon="plus"
      style="-webkit-app-region: no-drag"
      @click="emit('createTask')"
    >
      New Task
    </BaseButton>
  </div>
</template>
