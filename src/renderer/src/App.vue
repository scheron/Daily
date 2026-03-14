<script setup lang="ts">
import {useRoute} from "vue-router"
import {Toaster} from "vue-sonner"
import {ToastsLiteProvider} from "vue-toasts-lite"
import {invoke, until} from "@vueuse/core"

import {useAiStore} from "@/stores/ai/ai.store"
import {useBranchesStore} from "@/stores/branches.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {useUpdateStore} from "@/stores/update.store"
import {IconsSprite} from "@/ui/base/BaseIcon"

const route = useRoute()
const isLightRoute = route.name === "Settings" || route.name === "Assistant"

const settingsStore = useSettingsStore()

invoke(async () => {
  await until(() => settingsStore.isSettingsLoaded).toBeTruthy()

  if (isLightRoute) {
    const aiStore = useAiStore()
    await aiStore.checkConnection()
    return
  }

  const aiStore = useAiStore()
  const branchesStore = useBranchesStore()
  const tasksStore = useTasksStore()
  const tagsStore = useTagsStore()
  useUpdateStore()

  await Promise.all([branchesStore.getBranchList(), tasksStore.getTaskList(), tagsStore.getTagList()])
  await aiStore.checkConnection()
})
</script>

<template>
  <RouterView />

  <IconsSprite />
  <Toaster class="toaster" :duration="3000" close-button />
  <ToastsLiteProvider />
</template>
