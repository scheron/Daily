<script setup lang="ts">
import {IconsSprite} from "@daily/ui/base"

import {Toaster} from "vue-sonner"
import {invoke} from "@vueuse/core"

import {useContentSize} from "@/composables/useContentSize"
import {useDevice} from "@/composables/useDevice"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui.store"
import CalendarModal from "@/ui/modals/CalendarModal.vue"
import ExportTasksModal from "@/ui/modals/ExportTaskModal.vue"
import InfoPanelModal from "@/ui/modals/InfoPanelModal.vue"
import Main from "@/ui/sections/Main.vue"
import Sidebar from "@/ui/sections/Sidebar.vue"

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const uiStore = useUIStore()
useThemeStore()

const {isDesktop} = useDevice()
const {contentHeight, contentWidth} = useContentSize("container")

function onCreateTask() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setIsTaskEditorOpen(true)
}

// window.electronAPI.onMenuAction((action) => {
//   if (action === "new-task") onCreateTask()
//   if (action === "open-settings") uiStore.toggleIsInfoPanelOpen()
//   if (action === "export-data") uiStore.toggleIsExportTaskOpen()
// })

invoke(async () => {
  await tasksStore.loadTasks()
})
</script>

<template>
  <div ref="container" class="bg-base-300 flex h-dvh w-dvw overflow-hidden">
    <Sidebar :is-data-loaded="tasksStore.isDaysLoaded" :content-height="contentHeight" />
    <Main
      :content-height="contentHeight"
      :content-width="contentWidth"
      :task-editor-open="taskEditorStore.isTaskEditorOpen"
      @create-task="onCreateTask"
    />

    <CalendarModal :z-index="1" fullscreen />
    <InfoPanelModal v-if="!isDesktop" :z-index="2" fullscreen />
    <ExportTasksModal v-if="uiStore.isExportTaskOpen" :z-index="3" /> 
  </div>

  <IconsSprite />
  <Toaster class="toaster" :duration="3000" close-button />
</template>
