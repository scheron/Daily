<script setup lang="ts">
import {onBeforeUnmount, onMounted, useTemplateRef} from "vue"

const ROW_UNIT = 4
const ROW_GAP = 6

const root = useTemplateRef<HTMLElement>("root")
let observer: ResizeObserver | null = null

function updateSpan() {
  const el = root.value
  if (!el) return
  const child = el.firstElementChild as HTMLElement | null
  if (!child) return
  const height = child.getBoundingClientRect().height
  const span = Math.max(1, Math.ceil((height + ROW_GAP) / (ROW_UNIT + ROW_GAP)))
  el.style.gridRowEnd = `span ${span}`
}

onMounted(() => {
  const el = root.value
  if (!el) return
  const child = el.firstElementChild
  if (!child) return
  updateSpan()
  observer = new ResizeObserver(updateSpan)
  observer.observe(child)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="root" class="relative w-full">
    <slot />
  </div>
</template>
