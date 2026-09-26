<script setup lang="ts">
import {useRoute} from "vue-router"
import {toasts, ToastsLiteProvider} from "vue-toasts-lite"
import {invoke, until} from "@vueuse/core"

import {useAiStore} from "./stores/ai"
import {useBranchesStore} from "./stores/branches.store"
import {useMilestonesStore} from "./stores/milestones.store"
import {useSettingsStore} from "./stores/settings.store"
import {useStorageChangesStore} from "./stores/storageChanges.store"
import {useSyncServerStore} from "./stores/syncServer.store"
import {useTagsStore} from "./stores/tags.store"
import {useTaskCommentsStore} from "./stores/taskComments.store"
import {useTaskRelationsStore} from "./stores/taskRelations.store"
import {useTasksStore} from "./stores/tasks"
import {useUpdateStore} from "./stores/update.store"
import {IconsSprite} from "./ui/base/BaseIcon"
import {BaseModalProvider} from "./ui/base/BaseModal"

const route = useRoute()
const isLightRoute = route.name === "Settings" || route.name === "Assistant" || route.name === "Focus"
const isSettingsRoute = route.name === "Settings"

const settingsStore = useSettingsStore()

const BOOTSTRAP_READY_CEILING_MS = 10_000
const BOOTSTRAP_FAILURE_MESSAGE = "Some data could not be loaded. Restart the app if things look wrong."

if (!isLightRoute || isSettingsRoute) useSyncServerStore().watchForApprovals()

invoke(async () => {
  let signalled = false
  let timedOut = false

  const ceiling = setTimeout(() => {
    timedOut = true
    toasts.error(BOOTSTRAP_FAILURE_MESSAGE)
  }, BOOTSTRAP_READY_CEILING_MS)

  const signalRendererReady = () => {
    if (signalled) return
    signalled = true
    clearTimeout(ceiling)
    window.BridgeIPC["app:renderer-ready"]()
  }

  try {
    await until(() => settingsStore.isSettingsLoaded).toBeTruthy()

    if (isLightRoute) {
      if (route.name === "Focus") return

      const aiStore = useAiStore()

      if (isSettingsRoute) {
        const branchesStore = useBranchesStore()
        const tasksStore = useTasksStore()
        const tagsStore = useTagsStore()
        const milestonesStore = useMilestonesStore()
        useStorageChangesStore()

        await Promise.all([branchesStore.getBranchList(), tasksStore.loadTasks(), tagsStore.getTagList(), milestonesStore.getMilestoneList()])
        signalRendererReady()
        await aiStore.checkConnection()
      } else {
        signalRendererReady()
        await aiStore.checkConnection()
      }

      return
    }

    const aiStore = useAiStore()
    const branchesStore = useBranchesStore()
    const tasksStore = useTasksStore()
    const tagsStore = useTagsStore()
    const milestonesStore = useMilestonesStore()
    const taskRelationsStore = useTaskRelationsStore()
    const taskCommentsStore = useTaskCommentsStore()
    useUpdateStore()
    useStorageChangesStore()

    await Promise.all([
      branchesStore.getBranchList(),
      tasksStore.loadTasks(),
      tagsStore.getTagList(),
      milestonesStore.getMilestoneList(),
      taskRelationsStore.loadRelations(),
      taskCommentsStore.loadCommentCounts(),
    ])
    signalRendererReady()
    await aiStore.checkConnection()
  } catch {
    if (!timedOut) toasts.error(BOOTSTRAP_FAILURE_MESSAGE)
  } finally {
    clearTimeout(ceiling)
    signalRendererReady()
  }
})
</script>

<template>
  <RouterView />

  <BaseModalProvider />
  <IconsSprite />
  <ToastsLiteProvider />
</template>
