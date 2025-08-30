<script setup lang="ts">
import {onMounted, onUnmounted, ref} from "vue"
import {useCycleList} from "@vueuse/core"

import {sleep} from "@/utils/misc"
import BaseIcon from "@/ui/base/BaseIcon"
import {animateSwipe} from "./animation"

const isAnimating = ref(false)
const taskState = ref<"complete" | "cancel" | "idle">("idle")

const animationLoop = ["toggleTaskDone", "toggleTaskDone", "toggleTaskCancel", "toggleTaskCancel"].map((frame) => ({frame}))
const {state: animationState, next} = useCycleList(animationLoop)

const swipeOffset = ref(0)
const actionOpacity = ref(0)
const isTaskDone = ref(false)
const isTaskCancelled = ref(false)

async function toggleTaskDone() {
  await animateSwipe("forward", (offset, opacity) => {
    swipeOffset.value = offset
    actionOpacity.value = opacity
  })

  await sleep(400)

  await animateSwipe("backward", (offset, opacity) => {
    swipeOffset.value = offset
    actionOpacity.value = opacity
  })

  await sleep(100)

  isTaskDone.value = !isTaskDone.value
  isTaskCancelled.value = false
  taskState.value = isTaskDone.value ? "complete" : "idle"
}

async function toggleTaskCancel() {
  await animateSwipe("forward", (offset, opacity) => {
    swipeOffset.value = -offset
    actionOpacity.value = opacity
  })

  await sleep(800)

  await animateSwipe("backward", (offset, opacity) => {
    swipeOffset.value = -offset
    actionOpacity.value = opacity
  })

  await sleep(100)

  isTaskDone.value = false
  isTaskCancelled.value = !isTaskCancelled.value
  taskState.value = isTaskCancelled.value ? "cancel" : "idle"
}

async function animate() {
  if (isAnimating.value) return

  isAnimating.value = true

  if (animationState.value.frame === "toggleTaskDone") await toggleTaskDone()
  else await toggleTaskCancel()

  next()

  isAnimating.value = false
}

let animationInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  setTimeout(animate, 500)
  animationInterval = setInterval(animate, 3000)
})

onUnmounted(() => {
  if (animationInterval) clearInterval(animationInterval)
})
</script>

<template>
  <div class="relative select-none">
    <div class="bg-base-100 relative h-14 w-full overflow-hidden rounded-md">
      <div
        class="absolute inset-y-0 flex w-full items-center justify-start px-4 opacity-0"
        :class="[isTaskDone ? 'bg-base-300' : 'bg-success/60']"
        :style="{opacity: animationState.frame === 'toggleTaskDone' ? actionOpacity : 0}"
      >
        <BaseIcon :name="isTaskDone ? 'undo' : 'check-check'" class="text-base-content size-5" />
      </div>

      <div
        class="bg-success absolute top-0 left-0 z-30 w-2 rounded-l-sm transition-all duration-500"
        :class="[isTaskDone ? 'h-full opacity-100' : 'h-0 opacity-0']"
      />
      <div
        class="bg-warning absolute top-0 left-0 z-30 w-2 rounded-l-sm transition-all duration-500"
        :class="[isTaskCancelled ? 'h-full opacity-100' : 'h-0 opacity-0']"
      />
      <div
        class="group bg-base-100 absolute inset-0 z-10 flex h-full flex-wrap items-center px-4 transition-transform duration-75"
        :style="swipeOffset ? {transform: `translateX(${swipeOffset}px)`} : undefined"
      >
        <span class="text-base-content text-sm transition-opacity duration-200" :class="{'line-through opacity-50': isTaskDone || isTaskCancelled}">
          My Task Example
        </span>
      </div>

      <div
        class="bg-warning/60 absolute inset-y-0 flex w-full items-center justify-end px-4 opacity-0"
        :class="[isTaskCancelled ? 'bg-base-300' : 'bg-warning/60']"
        :style="{opacity: animationState.frame === 'toggleTaskCancel' ? actionOpacity : 0}"
      >
        <BaseIcon v-if="isTaskCancelled" name="undo" class="text-base-content size-5" />
        <BaseIcon v-else name="archive" class="text-base-content size-5" />
      </div>
    </div>

    <div class="text-base-content/70 mt-3 text-center text-xs">Use swipe to complete or discard task</div>
  </div>
</template>
