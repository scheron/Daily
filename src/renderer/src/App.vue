<script setup lang="ts">
import {Toaster} from "vue-sonner"
import {ToastsLiteProvider} from "vue-toasts-lite"
import {invoke} from "@vueuse/core"

import {useAiStore} from "@/stores/ai.store"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"
import {IconsSprite} from "@/ui/base/BaseIcon"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()
const aiStore = useAiStore()

invoke(async () => {
  await Promise.all([tasksStore.getTaskList(), tagsStore.getTagList(), aiStore.checkConnection()])
})
</script>

<template>
  <RouterView />

  <IconsSprite />
  <Toaster class="toaster" :duration="3000" close-button />
  <ToastsLiteProvider />
</template>
