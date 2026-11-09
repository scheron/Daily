<script setup lang="ts">
import {onScopeDispose} from "vue"
import {useRoute} from "vue-router"
import {ToastsLiteProvider} from "vue-toasts-lite"
import {invoke, until} from "@vueuse/core"

import {useAiStore} from "./stores/ai"
import {useBranchesStore} from "./stores/branches"
import {useMilestonesStore} from "./stores/milestones"
import {useSettingsStore} from "./stores/settings"
import {useStorageChangesStore} from "./stores/storage-changes"
import {useSubtasksStore} from "./stores/subtasks"
import {useSyncServerStore} from "./stores/sync-server"
import {useTagsStore} from "./stores/tags"
import {useTaskCommentsStore} from "./stores/task-comments"
import {useTaskRelationsStore} from "./stores/task-relations"
import {useTasksStore} from "./stores/tasks"
import {useUpdateStore} from "./stores/update"
import {toasts, useToasts} from "./composables/useToasts"
import IconsSprite from "./IconsSprite.vue"
import ModalProvider from "./ui/overlays/ModalProvider"

import type {RouteRecordNameGeneric} from "vue-router"

const LIGHT_ROUTES: RouteRecordNameGeneric[] = ["Settings", "Assistant", "QuickTask", "QuickTaskMenu"]

const route = useRoute()
const settingsStore = useSettingsStore()

const isLightRoute = LIGHT_ROUTES.includes(route.name)
const isSettingsRoute = route.name === "Settings"

const localToasts = useToasts("current")
const stopListeningForToasts = window.BridgeIPC["toast:on-show"](({type, message}) => localToasts[type](message))

if (!isLightRoute || isSettingsRoute) useSyncServerStore().watchForApprovals()

invoke(async () => {
  const BOOTSTRAP_FAILURE_MESSAGE = "Some data could not be loaded. Restart the app if things look wrong."

  let signalled = false
  let timedOut = false

  const ceiling = setTimeout(() => {
    timedOut = true
    toasts.error(BOOTSTRAP_FAILURE_MESSAGE)
  }, 10_000)

  function signalRendererReady() {
    if (signalled) return
    signalled = true
    clearTimeout(ceiling)
    window.BridgeIPC["app:renderer-ready"]()
  }

  try {
    await until(() => settingsStore.isSettingsLoaded).toBeTruthy()

    if (isLightRoute) {
      if (route.name === "QuickTaskMenu") return

      if (route.name === "QuickTask") {
        const branchesStore = useBranchesStore()
        const tasksStore = useTasksStore()
        const tagsStore = useTagsStore()
        const milestonesStore = useMilestonesStore()
        useStorageChangesStore()

        await Promise.all([branchesStore.getBranchList(), tasksStore.loadTasks(), tagsStore.getTagList(), milestonesStore.getMilestoneList()])
        signalRendererReady()
        return
      }

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
    const subtasksStore = useSubtasksStore()
    useUpdateStore()
    useStorageChangesStore()

    await Promise.all([
      branchesStore.getBranchList(),
      tasksStore.loadTasks(),
      tagsStore.getTagList(),
      milestonesStore.getMilestoneList(),
      taskRelationsStore.loadRelations(),
      taskCommentsStore.loadCommentCounts(),
      subtasksStore.loadSubtaskCounts(),
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

onScopeDispose(stopListeningForToasts)
</script>

<template>
  <RouterView />

  <ModalProvider />
  <IconsSprite />
  <ToastsLiteProvider />
</template>
