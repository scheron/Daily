<script setup lang="ts">
import {useMarkdown} from "@daily/composables/useMarkdown"
import {BaseButton, BaseIcon} from "@daily/ui/base"

defineProps<{taskContent: string}>()
defineEmits<{restore: []}>()

const {renderMarkdown} = useMarkdown()
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <div class="bg-success text-base-100 flex size-5 items-center justify-center rounded-full">
        <BaseIcon name="empty" class="size-4" />
      </div>
      <span class="text-base-content text-lg font-semibold">Task deleted successfully</span>
    </div>

    <div class="border-base-300 rounded-md border p-2">
      <p class="markdown line-clamp-4 text-xs" v-html="renderMarkdown(taskContent)" />
    </div>

    <BaseButton variant="ghost" class="" icon-class="size-4" icon="undo" @click="$emit('restore')"> Restore </BaseButton>
  </div>
</template>
