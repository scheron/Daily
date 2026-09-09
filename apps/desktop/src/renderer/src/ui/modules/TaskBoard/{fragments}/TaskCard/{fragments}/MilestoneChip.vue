<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

import type {Milestone} from "@daily/protocol"

defineProps<{milestone: Milestone}>()
</script>

<template>
  <span
    class="border-accent/40 bg-accent/15 text-accent inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-semibold"
  >
    <BaseIcon name="bookmark" class="size-3" />
    <span class="max-w-32 truncate leading-none">{{ milestone.name }}</span>
  </span>
</template>
