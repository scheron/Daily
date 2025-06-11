<script setup lang="ts">
import {computed} from "vue"

import {generateGradient, getOppositeColor} from "@/utils/colors"
import BaseButton from "@/ui/base/BaseButton.vue"

const props = withDefaults(defineProps<{colors?: string[]; steps?: number}>(), {
  colors: () => [
    "#D01C55", // Red
    "#015A6F", // Dark teal
    "#35A4D9", // Blue
    "#F5A623", // Orange
    "#7B61FF", // Purple
    "#615FFF", // Indigo
    "#00B8A9", // Turquoise
    "#F86624", // Orange red
    "#c1c1c1", // Dark gray
    "#000000", // Black
  ],
  steps: 6,
})

const palette = computed(() => props.colors.map((color) => generateGradient(getOppositeColor(color), color, props.steps)))

const emit = defineEmits<{selected: [color: string]}>()
</script>

<template>
  <div class="flex flex-wrap gap-[2px]">
    <div v-for="(column, colIndex) in palette" :key="colIndex" class="flex flex-col gap-[2px]">
      <BaseButton
        v-for="(color, rowIndex) in column"
        :key="rowIndex"
        :style="{backgroundColor: color}"
        class="size-6 rounded-sm p-0 border border-base-300 outline-none"
        @click="emit('selected', color)"
      />
    </div>
  </div>
</template>
