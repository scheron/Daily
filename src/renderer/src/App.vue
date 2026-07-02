<script setup lang="ts">
import {useRoute} from "vue-router"
import {ToastsLiteProvider} from "vue-toasts-lite"
import {invoke, until} from "@vueuse/core"

import {useAiStore} from "@/stores/ai"
import {useBranchesStore} from "@/stores/branches.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks"
import {useUpdateStore} from "@/stores/update.store"
import {IconsSprite} from "@/ui/base/BaseIcon"
import {BaseModalProvider} from "@/ui/base/BaseModal"

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

  <BaseModalProvider />
  <IconsSprite />
  <ToastsLiteProvider />
</template>
