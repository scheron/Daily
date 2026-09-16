<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import type {IconName} from "@/ui/base/BaseIcon"

defineProps<{
  icon: IconName
  label: string
  count: number
}>()
</script>

<template>
  <div class="flex items-center gap-2 px-2 pt-3 pb-1">
    <BaseIcon :name="icon" class="text-base-content/40 size-3.5" />
    <span class="text-base-content/40 text-xs tracking-wide uppercase">{{ label }}</span>
    <span class="text-base-content/40 font-mono text-xs">{{ count }}</span>

    <div class="ml-auto">
      <slot name="action" />
    </div>
  </div>
</template>
