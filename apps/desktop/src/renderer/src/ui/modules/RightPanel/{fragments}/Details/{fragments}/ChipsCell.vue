<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import type {IconName} from "@/ui/base/BaseIcon"

defineProps<{
  icon: IconName
  label: string
}>()

const emit = defineEmits<{open: []}>()
</script>

<template>
  <div class="flex h-9 w-full min-w-0 items-center gap-1">
    <button
      type="button"
      class="focus-visible-accent hover:bg-base-content/10 text-base-content/40 flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm transition-colors"
      @click="emit('open')"
    >
      <BaseIcon :name="icon" class="size-4" />
      <span class="leading-none whitespace-nowrap">{{ label }}</span>
    </button>

    <div class="hide-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
      <slot />
    </div>
  </div>
</template>
