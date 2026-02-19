<script setup lang="ts">
import {computed} from "vue"

import {TAG_COLOR_PALETTE} from "@shared/constants/theme/colorPalette"
import {generateGradient} from "@/utils/colors/generateGradient"
import BaseButton from "@/ui/base/BaseButton.vue"

const props = withDefaults(defineProps<{steps?: number}>(), {steps: 5})
const emit = defineEmits<{selected: [color: string]}>()

const palette = computed(() => {
  return TAG_COLOR_PALETTE.from.map((color, index) => generateGradient(color, TAG_COLOR_PALETTE.to[index], props.steps))
})
</script>

<template>
  <div class="flex flex-wrap gap-[2px]">
    <div v-for="(column, colIndex) in palette" :key="colIndex" class="flex flex-col gap-[2px]">
      <BaseButton
        v-for="(color, rowIndex) in column"
        :key="rowIndex"
        :style="{backgroundColor: color}"
        class="border-base-300 size-6 rounded-sm border p-0 outline-none"
        @click="emit('selected', color)"
      />
    </div>
  </div>
</template>
