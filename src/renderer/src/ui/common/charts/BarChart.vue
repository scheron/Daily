<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from "vue"
import {useResizeObserver} from "@vueuse/core"

type BarItem = {
  /** Bar height is `value / max(values)`. */
  value: number
  /** Axis tick rendered under the bar. */
  label?: string
  /** Hover content (precomputed string). */
  tooltip?: string
  /** Emphasized ("peak") treatment. */
  active?: boolean
}

const MIN_LABEL_GAP_PX = 6
const DENSE_BAR_GAP_PX = 1
const SPACED_BAR_GAP_PX = 4

const props = withDefaults(
  defineProps<{
    items: BarItem[]
    /** Tight gaps for many bars (vs spaced). */
    dense?: boolean
    /** Bar-area height in px. */
    height?: number
  }>(),
  {dense: false, height: 36},
)

const containerRef = ref<HTMLElement | null>(null)
const probeRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const maxLabelWidth = ref(0)

const hasLabels = computed(() => props.items.some((item) => item.label != null))
const max = computed(() => Math.max(1, ...props.items.map((item) => item.value)))

const visibleLabelSet = computed(() => {
  const itemCount = props.items.length
  const allIndices = new Set<number>(props.items.map((_, i) => i))

  const isMeasured = itemCount > 0 && containerWidth.value > 0 && maxLabelWidth.value > 0
  if (!isMeasured) return allIndices

  const gapPx = props.dense ? DENSE_BAR_GAP_PX : SPACED_BAR_GAP_PX
  const stride = computeLabelStride(itemCount, gapPx)
  if (stride === 1) return allIndices

  return pickLabelIndices(itemCount, stride)
})

useResizeObserver(containerRef, measure)

function measure() {
  containerWidth.value = containerRef.value?.offsetWidth ?? 0
  if (!probeRef.value) {
    maxLabelWidth.value = 0
    return
  }
  let max = 0
  for (const child of Array.from(probeRef.value.children)) {
    max = Math.max(max, (child as HTMLElement).offsetWidth)
  }
  maxLabelWidth.value = max
}

/** Bars to skip between two visible labels so neighbouring labels never overlap. */
function computeLabelStride(itemCount: number, gapPx: number): number {
  const slotWidth = (containerWidth.value - gapPx * (itemCount - 1)) / itemCount
  return Math.max(1, Math.ceil((maxLabelWidth.value + MIN_LABEL_GAP_PX) / slotWidth))
}

/** Every `stride`-th label index, always ending on the last bar (dropping a too-close neighbour). */
function pickLabelIndices(itemCount: number, stride: number): Set<number> {
  const indices = new Set<number>()
  for (let i = 0; i < itemCount; i += stride) indices.add(i)

  const lastIdx = itemCount - 1
  const lastPicked = Math.floor(lastIdx / stride) * stride
  if (lastPicked === lastIdx) return indices

  const isCrowdingLast = lastIdx - lastPicked < stride && lastPicked > 0
  if (isCrowdingLast) indices.delete(lastPicked)
  indices.add(lastIdx)

  return indices
}

watch(
  () => props.items,
  () => nextTick(measure),
  {deep: true},
)
onMounted(() => nextTick(measure))
</script>

<template>
  <div ref="containerRef" class="relative">
    <div v-if="hasLabels" ref="probeRef" aria-hidden="true" class="pointer-events-none invisible absolute top-0 left-0 -z-10">
      <span v-for="(item, i) in items" :key="i" class="inline-block text-[11px] font-medium">
        {{ item.label ?? "" }}
      </span>
    </div>

    <div class="flex items-stretch" :class="dense ? 'gap-px' : 'gap-1'" :style="{height: `${height}px`}">
      <div
        v-for="(item, i) in items"
        :key="i"
        v-tooltip="item.tooltip ? {content: item.tooltip, placement: 'top'} : undefined"
        class="flex flex-1 items-end"
      >
        <div
          class="w-full transition-[height] duration-500"
          :class="[dense ? 'rounded-[1px]' : 'rounded-sm', item.active ? 'bg-accent' : 'bg-accent/60']"
          :style="{height: `${(item.value / max) * 100}%`}"
        />
      </div>
    </div>

    <div v-if="hasLabels" class="mt-1 flex" :class="dense ? 'gap-px' : 'gap-1'">
      <span
        v-for="(item, i) in items"
        :key="i"
        class="text-base-content/40 flex-1 text-center text-[11px]"
        :class="{'text-base-content/70 font-medium': item.active}"
        :style="{visibility: visibleLabelSet.has(i) ? 'visible' : 'hidden'}"
      >
        {{ item.label ?? "" }}
      </span>
    </div>
  </div>
</template>
