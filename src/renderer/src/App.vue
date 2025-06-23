<script setup lang="ts">
import {computed} from "vue"
import {Toaster} from "vue-sonner"
import {invoke} from "@vueuse/core"
import {useContentSize} from "@/composables/useContentSize"
import {useDevice} from "@/composables/useDevice"
import {useStorageStore} from "@/stores/storage.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui.store"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import {IconsSprite} from "@/ui/base/BaseIcon"
import Main from "@/ui/sections/Main.vue"
import Sidebar from "@/ui/sections/Sidebar.vue"
import SidebarMini from "@/ui/sections/SidebarMini.vue"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const taskEditorStore = useTaskEditorStore()
const uiStore = useUIStore()

useStorageStore()
useThemeStore()

const {isDesktop, isMobile, isTablet} = useDevice()
const {contentHeight, contentWidth} = useContentSize("container")

const isDataLoaded = computed(() => tasksStore.isDaysLoaded && tagsStore.isTagsLoaded)

function onCreateTask() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setIsTaskEditorOpen(true)
}

window.electronAPI.onMenuAction((action) => {
  if (action === "new-task") onCreateTask()
  else if (action === "toggle-sidebar") uiStore.toggleSidebarCollapse()
})

invoke(async () => {
  await Promise.all([tasksStore.loadTasks(), tagsStore.loadTags()])
})
</script>

<template>
  <div ref="container" class="bg-base-300 flex h-dvh w-dvw overflow-hidden">
    <template v-if="isDesktop">
      <SidebarMini v-if="uiStore.isSidebarCollapsed" :content-height="contentHeight" :data-loaded="isDataLoaded" />
      <Sidebar v-else :content-height="contentHeight" :data-loaded="isDataLoaded" />
    </template>

    <template v-else-if="isTablet">
      <SidebarMini :content-height="contentHeight" :data-loaded="isDataLoaded" />

      <BaseAnimation name="slideRight" :duration="200">
        <div v-if="uiStore.isMobileSidebarOpen" class="fixed top-0 left-0 z-40">
          <Sidebar :content-height="contentHeight" :data-loaded="isDataLoaded" />
        </div>
      </BaseAnimation>
    </template>

    <BaseAnimation name="slideRight" :duration="200">
      <div v-if="isMobile && uiStore.isMobileSidebarOpen" class="fixed top-0 left-0 z-40">
        <Sidebar :content-height="contentHeight" :data-loaded="isDataLoaded" />
      </div>
    </BaseAnimation>

    <BaseAnimation name="fade" :duration="200">
      <div v-if="!isDesktop && uiStore.isMobileSidebarOpen" class="fixed inset-0 z-30 bg-black/50" @click="uiStore.toggleSidebarCollapse(false)" />
    </BaseAnimation>

    <Main
      :content-height="contentHeight"
      :content-width="contentWidth"
      :task-editor-open="taskEditorStore.isTaskEditorOpen"
      @create-task="onCreateTask"
    />
  </div>

  <IconsSprite />
  <Toaster class="toaster" :duration="3000" close-button />
</template>
