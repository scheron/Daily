<script setup lang="ts">
import {useDevice} from "@/composables/useDevice"
import {useUIStore} from "@/stores/ui.store"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton.vue"
import DayTitle from "@/ui/features/DayTitle"
import TaskEditor from "@/ui/features/TaskEditor"
import TasksList from "@/ui/features/TasksList"
import Toolbar from "@/ui/features/Toolbar"

defineProps<{
  taskEditorOpen: boolean
  contentHeight: number
  contentWidth: number
}>()

const emit = defineEmits<{
  createTask: []
}>()

const uiStore = useUIStore()

const {isMobile} = useDevice()
</script>

<template>
  <main class="bg-base-100 flex-1" :style="{width: contentWidth + 'px'}">
    <div class="border-base-300 h-header flex items-center justify-between border-b px-4 py-2" style="-webkit-app-region: drag">
      <div class="flex items-center gap-2">
        <BaseButton v-if="isMobile" variant="ghost" icon="sidebar" class="ml-16" style="-webkit-app-region: no-drag" @click="uiStore.toggleSidebarCollapse()" />
        <DayTitle />
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

    <div class="text-base-content flex size-full flex-col" :style="{height: contentHeight + 'px'}">
      <div class="border-base-300 md:h-header flex items-center border-b">
        <Toolbar />
      </div>

      <div class="bg-base-200 flex-1 overflow-y-auto">
        <BaseAnimation name="fade" mode="out-in">
          <TaskEditor v-if="taskEditorOpen" />
          <TasksList v-else />
        </BaseAnimation>
      </div>
    </div>
  </main>
</template>
