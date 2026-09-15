<script setup lang="ts">
import {useTemplateRef} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import {useFilterStore} from "@/stores/filter.store"
import {useStorageStore} from "@/stores/storage.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useThemeStore} from "@/stores/theme"
import {useUIStore} from "@/stores/ui"
import Header from "@/ui/modules/Header"
import RightPanel from "@/ui/modules/RightPanel"
import TaskBoard from "@/ui/modules/TaskBoard"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {useSearchModal} from "@/ui/overlays/SearchModal"
import UpdateBanner from "@/ui/overlays/UpdateBanner.vue"
import {useContentSize} from "./composables/useContentSize"
import {usePanelSize} from "./composables/usePanelSize"
import MainDragIndicator from "./{fragments}/MainDragIndicator"

const uiStore = useUIStore()
const taskEditorStore = useTaskEditorStore()
const branchesStore = useBranchesStore()
const filterStore = useFilterStore()
useStorageStore()
useThemeStore()

const containerRef = useTemplateRef<HTMLElement>("container")

const confirmUnsavedModal = useConfirmUnsavedModal()
const searchModal = useSearchModal()
const {contentHeight} = useContentSize(containerRef)
const {size: rightWidth, setSize: setRightWidth} = usePanelSize()

window.BridgeIPC["shortcut:tasks:create"](() => onCreateTask())
window.BridgeIPC["shortcut:ui:open-search-panel"](() => searchModal.toggle())
window.BridgeIPC["shortcut:ui:open-assistant-panel"](() => window.BridgeIPC.send("assistant:open"))
window.BridgeIPC["shortcut:ui:open-settings-panel"](() => window.BridgeIPC.send("settings:open"))
window.BridgeIPC["shortcut:ui:calendar-dock:toggle"](() => {
  if (taskEditorStore.isOpen) return
  uiStore.toggleCalendarDock()
})

async function onCreateTask() {
  const proceed = await confirmUnsavedModal.open()
  if (!proceed) return
  taskEditorStore.openNew({
    branchId: branchesStore.activeBranchId,
    milestoneId: filterStore.activeMilestoneId,
  })
}
</script>

<template>
  <div ref="container" class="app-shell bg-base-100 relative flex h-dvh w-dvw overflow-hidden">
    <UpdateBanner />

    <main class="app-main-panel bg-base-100 min-w-0 flex-1">
      <Header @create-task="onCreateTask" />

      <div class="text-base-content flex size-full" :style="{height: contentHeight + 'px'}">
        <TaskBoard @create-task="onCreateTask" />
        <MainDragIndicator v-if="taskEditorStore.isOpen && !uiStore.isCompact" :size="rightWidth" @update:size="setRightWidth" />
        <RightPanel :width="rightWidth" />
      </div>
    </main>
  </div>
</template>
