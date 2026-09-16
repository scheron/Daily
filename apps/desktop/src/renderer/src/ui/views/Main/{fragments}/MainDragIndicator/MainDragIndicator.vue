<script setup lang="ts">
import BaseDragIndicator from "@/ui/base/BaseDragIndicator.vue"
import {useAxisDrag} from "./useAxisDrag"

const props = defineProps<{
  /** Current panel size in px (the drag baseline) */
  size: number
}>()
const emit = defineEmits<{"update:size": [value: number]}>()

const {isDragging, startDrag} = useAxisDrag()

function onPointerDown(event: PointerEvent) {
  const startSize = props.size
  startDrag(event, (delta) => emit("update:size", startSize - delta))
}
</script>

<template>
  <BaseDragIndicator class="relative z-30 translate-x-[calc(50%+0.5px)] py-6" :active="isDragging" @pointerdown="onPointerDown" />
</template>
