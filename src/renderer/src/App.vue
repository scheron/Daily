<script setup lang="ts">
import {Toaster} from "vue-sonner"
import {invoke} from "@vueuse/core"
import {useTagsStore} from "@/stores/tags.store"
import {useTasksStore} from "@/stores/tasks.store"

import {IconsSprite} from "@/ui/base/BaseIcon"

const tasksStore = useTasksStore()
const tagsStore = useTagsStore()

invoke(async () => {
  await Promise.all([tasksStore.getTaskList(), tagsStore.getTagList()])
})
</script>

<template>
  <RouterView />

  <IconsSprite />
  <Toaster class="toaster" :duration="3000" close-button />
</template>
