<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import type {IconName} from "@/ui/base/BaseIcon"

defineProps<{
  /** Section heading shown centered between two divider lines. */
  label?: string
  /** Optional icon rendered next to the heading. */
  icon?: IconName
}>()
</script>

<template>
  <section class="flex flex-col gap-2">
    <div v-if="label" class="mb-1 flex items-center gap-3">
      <div class="bg-base-300 h-px flex-1"></div>
      <div class="text-base-content/60 flex items-center gap-1.5">
        <BaseIcon v-if="icon" :name="icon" class="size-3.5 shrink-0" />
        <h2 class="text-xs font-semibold tracking-wider uppercase">{{ label }}</h2>
      </div>
      <div class="bg-base-300 h-px flex-1"></div>
    </div>
    <div class="flex flex-col">
      <slot />
    </div>
  </section>
</template>
