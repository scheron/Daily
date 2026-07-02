<script setup lang="ts">
import StepNav from "@/ui/common/misc/StepNav.vue"

withDefaults(
  defineProps<{
    index: number
    total: number
    canPrev: boolean
    canNext: boolean
  }>(),
  {
    index: 0,
    total: 0,
    canPrev: false,
    canNext: false,
  },
)

const emit = defineEmits<{
  prev: []
  next: []
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <span v-if="index >= 0" class="text-base-content/50 text-xs">{{ index + 1 }} / {{ total }}</span>
    <StepNav :can-prev="canPrev" :can-next="canNext" prev-label="Previous task" next-label="Next task" @prev="emit('prev')" @next="emit('next')" />
  </div>
</template>
