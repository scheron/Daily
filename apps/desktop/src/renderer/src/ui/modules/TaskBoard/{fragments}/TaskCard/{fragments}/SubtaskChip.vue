<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"

defineProps<{count: {done: number; total: number}}>()
</script>

<template>
  <div class="text-base-content/75 inline-flex items-center gap-1 whitespace-nowrap">
    <BaseIcon name="list-checks" class="text-base-content/40 size-3.5" />
    <span>{{ count.done }}/{{ count.total }}</span>
  </div>
</template>
