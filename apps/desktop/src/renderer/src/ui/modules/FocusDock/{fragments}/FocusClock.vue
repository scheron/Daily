<script setup lang="ts">
import {computed} from "vue"
import {useNow} from "@vueuse/core"

import {cn} from "@/utils/ui/tailwindcss"
import {FOCUS_DURATIONS} from "@shared/constants/focus"

import type {FocusSession} from "@shared/types/focus"

const props = defineProps<{session: FocusSession}>()

const isBreak = computed(() => props.session.phase === "break")

const now = useNow({interval: 250})

const clock = computed(() => {
  const {mode, runStartedAt, intervalFocusedSeconds, tasks, currentTaskId} = props.session
  const stretch = runStartedAt ? Math.max(0, (now.value.getTime() - Date.parse(runStartedAt)) / 1000) : 0
  const durations = FOCUS_DURATIONS[mode]

  if (!durations) {
    const count = (tasks.find((task) => task.taskId === currentTaskId)?.focusedSeconds ?? 0) + stretch
    return {seconds: Math.floor(count), share: (count % 60) / 60}
  }

  const [total, before] = isBreak.value ? [durations.breakSeconds, 0] : [durations.focusSeconds, intervalFocusedSeconds]
  const passed = Math.min(total, before + stretch)
  return {seconds: Math.ceil(total - passed), share: passed / total}
})
const label = computed(() => {
  const {seconds} = clock.value
  const hours = Math.floor(seconds / 3600)
  const minutesAndSeconds = [Math.floor(seconds / 60) % 60, seconds % 60].map((part) => String(part).padStart(2, "0")).join(":")
  return hours ? `${hours}:${minutesAndSeconds}` : minutesAndSeconds
})

function getArcClasses(isBreak: boolean) {
  return cn(isBreak ? "stroke-success" : "stroke-accent")
}
</script>

<template>
  <div class="relative flex size-32 shrink-0 items-center justify-center self-center">
    <svg viewBox="0 0 100 100" class="absolute inset-0 size-full" aria-hidden="true">
      <circle cx="50" cy="50" r="45" fill="none" stroke-width="6" class="stroke-base-300" />
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke-width="6"
        stroke-linecap="round"
        pathLength="1"
        stroke-dasharray="1"
        :stroke-dashoffset="1 - clock.share"
        transform="rotate(-90 50 50)"
        :class="getArcClasses(isBreak)"
      />
    </svg>
    <span class="font-mono text-2xl font-semibold">{{ label }}</span>
  </div>
</template>
