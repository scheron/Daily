<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import Logo from "@/ui/common/misc/Logo.vue"

defineProps<{
  title?: string
  hideToolbar?: boolean
}>()

defineEmits<{close: []}>()
</script>

<template>
  <div class="border-base-300 h-header flex items-center justify-between border-b px-4 py-1">
    <slot v-if="!hideToolbar" name="toolbar">
      <div class="text-accent flex items-center gap-2 pl-4">
        <span v-if="title" class="text-base-content/70 text-xs font-semibold uppercase">{{ title }}</span>
        <template v-else>
          <Logo class="h-5" />
          <h2 class="font-mono text-xl font-bold">Daily</h2>
        </template>
      </div>
    </slot>

    <div class="ml-auto flex items-center gap-2">
      <slot name="actions" />
      <BaseButton variant="ghost" icon="x-mark" class="text-base-content hover:text-accent" @click="$emit('close')" />
    </div>
  </div>
</template>
