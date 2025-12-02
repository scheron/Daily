<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import TaskContentViewer from "./TaskContentViewer.vue"

defineProps<{taskContent: string}>()
defineEmits<{restore: []}>()
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <div class="bg-success text-base-100 flex size-5 items-center justify-center rounded-full">
        <BaseIcon name="empty" class="size-4" />
      </div>
      <span class="text-base-content text-lg font-semibold">Task deleted successfully</span>
    </div>

    <div class="border-base-300 line-clamp-4 max-h-[250px] overflow-y-auto rounded-md border p-2 text-xs">
      <TaskContentViewer :content="taskContent" />
    </div>

    <BaseButton variant="ghost" class="" icon-class="size-4" icon="undo" @click="$emit('restore')"> Restore </BaseButton>
  </div>
</template>
