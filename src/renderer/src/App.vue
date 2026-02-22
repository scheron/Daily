<script setup lang="ts">
import {Toaster} from "vue-sonner"
import {ToastsLiteProvider} from "vue-toasts-lite"
import {invoke, until} from "@vueuse/core"

import {useAiStore} from "@/stores/ai/ai.store"
import {useBranchesStore} from "@/stores/branches.store"
import {useSettingsStore} from "@/stores/settings.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {IconsSprite} from "@/ui/base/BaseIcon"

const settingsStore = useSettingsStore()
const aiStore = useAiStore()
const branchesStore = useBranchesStore()
const tasksStore = useTasksStore()
const tagsStore = useTagsStore()

invoke(async () => {
  await until(() => settingsStore.isSettingsLoaded).toBeTruthy()
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
