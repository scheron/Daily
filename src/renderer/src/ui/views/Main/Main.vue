<script setup lang="ts">
import {useBranchesStore} from "@/stores/branches.store"
import {useStorageStore} from "@/stores/storage.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useTasksStore} from "@/stores/tasks"
import {useThemeStore} from "@/stores/theme.store"
import {useUIStore} from "@/stores/ui"
import {STORAGE_KEY_LEFT_PANEL_WIDTH, STORAGE_KEY_RIGHT_PANEL_WIDTH} from "@/constants/storageKeys"
import {LEFT_PANEL_SIZE, RIGHT_PANEL_SIZE} from "@/constants/ui"
import MainDragIndicator from "@/ui/common/indicators/MainDragIndicator.vue"
import Header from "@/ui/modules/Header"
import LeftPanel from "@/ui/modules/LeftPanel"
import RightPanel from "@/ui/modules/RightPanel"
import TaskBoard from "@/ui/modules/TaskBoard"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {useSearchModal} from "@/ui/overlays/SearchModal"
import {UpdateBanner} from "@/ui/overlays/UpdateBanner"
import {usePanelSize} from "@/ui/views/Main/model/usePanelSize"

import {useContentSize} from "./model/useContentSize"

const tasksStore = useTasksStore()
const uiStore = useUIStore()
const taskEditorStore = useTaskEditorStore()
const branchesStore = useBranchesStore()

const confirmUnsavedModal = useConfirmUnsavedModal()
const searchModal = useSearchModal()

useStorageStore()
useThemeStore()

const {contentHeight} = useContentSize("container")

const {size: leftWidth, setSize: setLeftWidth} = usePanelSize(STORAGE_KEY_LEFT_PANEL_WIDTH, LEFT_PANEL_SIZE)
const {size: rightWidth, setSize: setRightWidth} = usePanelSize(STORAGE_KEY_RIGHT_PANEL_WIDTH, RIGHT_PANEL_SIZE)

async function onCreateTask() {
  const proceed = await confirmUnsavedModal.open()
  if (!proceed) return
  taskEditorStore.openNew({
    date: tasksStore.activeDay,
    branchId: branchesStore.activeBranchId,
  })
}

window.BridgeIPC["shortcut:tasks:create"](() => onCreateTask())
window.BridgeIPC["shortcut:ui:open-search-panel"](() => searchModal.toggle())
window.BridgeIPC["shortcut:ui:open-assistant-panel"](() => window.BridgeIPC.send("assistant:open"))
window.BridgeIPC["shortcut:ui:open-settings-panel"](() => window.BridgeIPC.send("settings:open"))
window.BridgeIPC["shortcut:ui:left-panel:toggle"](() => uiStore.toggleLeftPanel())
</script>

<template>
  <div ref="container" class="app-shell bg-base-100 relative flex h-dvh w-dvw overflow-hidden">
    <UpdateBanner />

    <main class="app-main-panel bg-base-100 min-w-0 flex-1">
      <Header @create-task="onCreateTask" />

      <div class="text-base-content flex size-full" :style="{height: contentHeight + 'px'}">
        <LeftPanel :width="leftWidth" />
        <MainDragIndicator v-if="uiStore.leftPanelVisible" :size="leftWidth" side="left" @update:size="setLeftWidth" />
        <TaskBoard @create-task="onCreateTask" />
        <MainDragIndicator v-if="taskEditorStore.isOpen && !uiStore.isCompact" :size="rightWidth" side="right" @update:size="setRightWidth" />
        <RightPanel :width="rightWidth" />
      </div>
    </main>
  </div>
</template>
