<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"

import type {IconName} from "@/types/icons"

defineProps<{
  icon: IconName
  label: string
}>()

const emit = defineEmits<{open: []}>()
</script>

<template>
  <div class="flex h-9 w-full min-w-0 items-center gap-1">
    <BaseButton variant="cell-muted" class="shrink-0" @click="emit('open')">
      <BaseIcon :name="icon" class="size-4" />
      <span class="whitespace-nowrap leading-none">{{ label }}</span>
    </BaseButton>

    <div class="hide-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
      <slot />
    </div>
  </div>
</template>
