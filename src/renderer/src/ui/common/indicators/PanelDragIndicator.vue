<script setup lang="ts">
import {useUIStore} from "@/stores/ui"
import {useAxisDrag} from "@/composables/useAxisDrag"
import {WIDGET_DEFS} from "@/constants/widgets"
import {resizePanes} from "@/utils/ui/resizePanes"
import BaseDragIndicator from "@/ui/base/BaseDragIndicator.vue"

import type {PaneBounds} from "@/utils/ui/resizePanes"

const FALLBACK_BOUNDS: PaneBounds = {min: 80, max: 600}

const props = defineProps<{
  /** Index of the slot boundary this handle sits on (between slot `boundary` and `boundary + 1`) */
  boundary: number
}>()

const uiStore = useUIStore()
const {isDragging, startDrag} = useAxisDrag("vertical")

function onPointerDown(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  const prev = handle.previousElementSibling
  const filler = handle.parentElement?.lastElementChild
  if (!(prev instanceof HTMLElement) || !(filler instanceof HTMLElement)) return

  const a = props.boundary
  const startSizes = [prev.offsetHeight, filler.offsetHeight]

  startDrag(event, (delta) => {
    const sizes = resizePanes(startSizes, 0, delta, slotBounds(a), fillerBounds())
    uiStore.setSlotHeight(a, sizes[0])
  })
}

function slotBounds(index: number): PaneBounds {
  const slot = uiStore.slots[index]
  if (!slot) return FALLBACK_BOUNDS
  const def = WIDGET_DEFS[slot.id]
  return {min: def.minHeight, max: def.maxHeight}
}

function fillerBounds(): PaneBounds {
  const slot = uiStore.slots[uiStore.slots.length - 1]
  if (!slot) return FALLBACK_BOUNDS
  return {min: WIDGET_DEFS[slot.id].minHeight, max: Infinity}
}
</script>

<template>
  <BaseDragIndicator variant="vertical" :active="isDragging" @pointerdown="onPointerDown" />
</template>
