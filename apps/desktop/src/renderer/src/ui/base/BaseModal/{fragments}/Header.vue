<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

defineProps<{
  title?: string
}>()

defineEmits<{close: []}>()
</script>

<template>
  <div class="border-base-300 h-header flex items-center justify-between border-b px-4 py-1">
    <div class="text-accent flex items-center gap-2 pl-4">
      <span v-if="title" class="text-base-content/70 text-xs font-semibold uppercase">{{ title }}</span>
      <template v-else>
        <BaseIcon name="logo" class="text-accent h-5" />
        <h2 class="font-mono text-xl font-bold">Daily</h2>
      </template>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <BaseButton variant="ghost-primary" icon="x-mark" @click="$emit('close')" />
    </div>
  </div>
</template>
