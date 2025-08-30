<script setup lang="ts">
import {useTagsStore} from "@/stores/tags.store"
import {Tag, Task} from "@/types/tasks"

import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import {TaskCard} from "@/ui/features/TaskCard"

defineProps<{tasks: Task[]}>()

const tagsStore = useTagsStore()

function getTaskTags(task: Task): Tag[] {
  return task.tags.map((tag) => tagsStore.tagsMap.get(tag.name)).filter(Boolean) as Tag[]
}
</script>

<template>
  <div class="flex flex-1 flex-col gap-2 p-2">
    <BaseAnimation name="fade" group mode="out-in">
      <TaskCard v-for="task in tasks" :key="task.id" :task="task" :tags="getTaskTags(task)" />
    </BaseAnimation>
  </div>
</template>
