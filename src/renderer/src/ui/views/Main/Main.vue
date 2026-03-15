<script setup lang="ts">
import {useStorageStore} from "@/stores/storage.store"
import {useTaskEditorStore} from "@/stores/taskEditor.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui.store"
import BaseModal from "@/ui/base/BaseModal.vue"
import UpdateBanner from "@/ui/common/misc/UpdateBanner.vue"
import SearchForm from "@/ui/modules/SearchForm"

import Content from "./{fragments}/Content"
import Footer from "./{fragments}/Footer.vue"
import Header from "./{fragments}/Header.vue"
import Toolbar from "./{fragments}/Toolbar.vue"
import {useContentSize} from "./model/useContentSize"

const tasksStore = useTasksStore()
const taskEditorStore = useTaskEditorStore()
const uiStore = useUIStore()

useStorageStore()
useThemeStore()

const {contentHeight, contentWidth, footerHeight} = useContentSize("container")

function onCreateTask() {
  taskEditorStore.setCurrentEditingTask(null)
  taskEditorStore.setEditorTags([])
  taskEditorStore.setIsTaskEditorOpen(true)
}

window.BridgeIPC["shortcut:tasks:create"](() => onCreateTask())
window.BridgeIPC["shortcut:ui:open-search-panel"](() => uiStore.toggleSearchModal())
window.BridgeIPC["shortcut:ui:open-assistant-panel"](() => window.BridgeIPC.send("assistant:open"))
window.BridgeIPC["shortcut:ui:open-settings-panel"](() => window.BridgeIPC.send("settings:open"))
window.BridgeIPC["shortcut:ui:toggle-tasks-view-mode"](() => uiStore.toggleTasksViewMode())
</script>

<template>
  <div ref="container" class="app-shell bg-base-300 flex h-dvh w-dvw overflow-hidden">
    <UpdateBanner />

    <main class="app-main-panel bg-base-100 flex-1" :style="{width: contentWidth + 'px'}">
      <Header :task-editor-open="taskEditorStore.isTaskEditorOpen" :active-day="tasksStore.activeDay" @create-task="onCreateTask" />

      <div class="app-main-body text-base-content flex size-full flex-col" :style="{height: contentHeight + 'px'}">
        <div v-if="uiStore.tasksViewMode === 'list'" class="app-toolbar border-base-300 md:h-header flex items-center border-b">
          <Toolbar />
        </div>

        <Content :task-editor-open="taskEditorStore.isTaskEditorOpen" @create-task="onCreateTask" />
      </div>

      <Footer v-if="footerHeight > 0" :active-day="tasksStore.activeDay" />
    </main>

    <BaseModal
      :open="uiStore.isSearchModalOpen"
      hide-header
      container-class="max-h-[70vh] w-[600px]"
      content-class="overflow-hidden"
      @close="uiStore.closeSearchModal()"
    >
      <SearchForm />
    </BaseModal>
  </div>
</template>
