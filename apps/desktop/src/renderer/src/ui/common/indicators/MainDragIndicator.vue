<script setup lang="ts">
import {useAxisDrag} from "@/composables/useAxisDrag"
import BaseDragIndicator from "@/ui/base/BaseDragIndicator.vue"

const props = defineProps<{
  /** Current panel size in px (the drag baseline) */
  size: number
  /** Which side the panel sits on; flips the drag direction */
  side: "left" | "right"
}>()
const emit = defineEmits<{"update:size": [value: number]}>()

const {isDragging, startDrag} = useAxisDrag("horizontal")

function onPointerDown(event: PointerEvent) {
  const startSize = props.size
  const sign = props.side === "left" ? 1 : -1
  startDrag(event, (delta) => emit("update:size", startSize + sign * delta))
}
</script>

<template>
  <BaseDragIndicator variant="horizontal" :active="isDragging" @pointerdown="onPointerDown" />
</template>
