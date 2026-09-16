<script setup lang="ts">
import {useBranchesStore} from "@/stores/branches.store"
import {useFilterStore} from "@/stores/filter.store"
import {useStorageStore} from "@/stores/storage.store"
import {useTaskEditorStore} from "@/stores/task-editor"
import {useThemeStore} from "@/stores/theme"
import {useUIStore} from "@/stores/ui"
import RightPanel from "@/ui/modules/RightPanel"
import TaskBoard from "@/ui/modules/TaskBoard"
import {useConfirmUnsavedModal} from "@/ui/overlays/ConfirmUnsavedModal"
import {useSearchModal} from "@/ui/overlays/SearchModal"
import UpdateBanner from "@/ui/overlays/UpdateBanner.vue"
import {usePanelSize} from "./composables/usePanelSize"
import MainDragIndicator from "./{fragments}/MainDragIndicator"

const uiStore = useUIStore()
const taskEditorStore = useTaskEditorStore()
const branchesStore = useBranchesStore()
const filterStore = useFilterStore()
useStorageStore()
useThemeStore()

const confirmUnsavedModal = useConfirmUnsavedModal()
const searchModal = useSearchModal()
const {size: rightWidth, setSize: setRightWidth} = usePanelSize()

window.BridgeIPC["shortcut:tasks:create"](() => onCreateTask())
window.BridgeIPC["shortcut:ui:open-search-panel"](() => searchModal.toggle())
window.BridgeIPC["shortcut:ui:open-assistant-panel"](() => window.BridgeIPC.send("assistant:open"))
window.BridgeIPC["shortcut:ui:open-settings-panel"](() => window.BridgeIPC.send("settings:open"))
window.BridgeIPC["shortcut:ui:calendar-dock:toggle"](() => uiStore.toggleCalendarDock())

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
  <div class="app-shell bg-base-100 relative flex h-dvh w-dvw overflow-hidden">
    <UpdateBanner />

    <main class="app-main-panel bg-base-100 min-w-0 flex-1">
      <div class="text-base-content flex size-full">
        <TaskBoard @create-task="onCreateTask" />
        <MainDragIndicator v-if="taskEditorStore.isOpen" :size="rightWidth" @update:size="setRightWidth" />
        <RightPanel :width="rightWidth" />
      </div>
    </main>
  </div>
</template>
