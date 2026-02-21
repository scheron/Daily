<script setup lang="ts">
import {computed} from "vue"

import {useStorageStore} from "@/stores/storage.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui.store"
import {useDevice} from "@/composables/useDevice"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"

import {useContentSize} from "./composables/useContentSize"
import Content from "./{fragments}/Content"
import Header from "./{fragments}/Header.vue"
import Sidebar from "./{fragments}/Sidebar"
import SidebarMini from "./{fragments}/SidebarMini"
import Toolbar from "./{fragments}/Toolbar"

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
  taskEditorStore.setEditorTags([])
  taskEditorStore.setIsTaskEditorOpen(true)
}

window.BridgeIPC["shortcut:tasks:create"](() => onCreateTask())
window.BridgeIPC["shortcut:ui:toggle-sidebar"](() => uiStore.toggleSidebarCollapse())
window.BridgeIPC["shortcut:ui:open-calendar-panel"](() => uiStore.openSidebarSection("calendar"))
window.BridgeIPC["shortcut:ui:open-tags-panel"](() => uiStore.openSidebarSection("tags"))
window.BridgeIPC["shortcut:ui:open-search-panel"](() => uiStore.openSidebarSection("search"))
window.BridgeIPC["shortcut:ui:open-assistant-panel"](() => uiStore.openSidebarSection("assistant"))
window.BridgeIPC["shortcut:ui:open-settings-panel"](() => uiStore.openSidebarSection("settings"))
window.BridgeIPC["shortcut:ui:toggle-tasks-view-mode"](() => uiStore.toggleTasksViewMode())
</script>

<template>
  <div ref="container" class="app-shell bg-base-300 flex h-dvh w-dvw overflow-hidden">
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

    <main class="app-main-panel bg-base-100 flex-1" :style="{width: contentWidth + 'px'}">
      <Header
        :task-editor-open="taskEditorStore.isTaskEditorOpen"
        :active-day="tasksStore.activeDay"
        @toggle-sidebar="uiStore.toggleSidebarCollapse()"
        @create-task="onCreateTask"
      />

      <div class="app-main-body text-base-content flex size-full flex-col" :style="{height: contentHeight + 'px'}">
        <div v-if="uiStore.tasksViewMode === 'list'" class="app-toolbar border-base-300 md:h-header flex items-center border-b">
          <Toolbar />
        </div>

        <Content :task-editor-open="taskEditorStore.isTaskEditorOpen" @create-task="onCreateTask" />
      </div>
    </main>
  </div>
</template>
