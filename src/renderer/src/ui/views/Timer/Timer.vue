<script setup lang="ts">
// TODO: Rework this in future
import {computed, onUnmounted, ref} from "vue"
import {useStorageStore} from "@/stores/storage.store"
import {useThemeStore} from "@/stores/theme.store"

import BaseButton from "@/ui/base/BaseButton.vue"

useStorageStore()
useThemeStore()

const minutes = ref(25)
const seconds = ref(0)
const isRunning = ref(false)
const isBreak = ref(false)
let intervalId: number | null = null

const totalSeconds = computed(() => minutes.value * 60 + seconds.value)
const displayMinutes = computed(() => Math.floor(totalSeconds.value / 60))
const displaySeconds = computed(() => totalSeconds.value % 60)

function startTimer() {
  if (isRunning.value) return

  isRunning.value = true
  intervalId = setInterval(() => {
    if (totalSeconds.value > 0) {
      const newTotal = totalSeconds.value - 1
      minutes.value = Math.floor(newTotal / 60)
      seconds.value = newTotal % 60
    } else {
      stopTimer()
      if (isBreak.value) {
        resetPomodoro()
      } else {
        startBreak()
      }
    }
  }, 1000)
}

function stopTimer() {
  isRunning.value = false
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function resetTimer() {
  stopTimer()
  if (isBreak.value) {
    minutes.value = 5
    seconds.value = 0
  } else {
    minutes.value = 25
    seconds.value = 0
  }
}

function resetPomodoro() {
  isBreak.value = false
  minutes.value = 25
  seconds.value = 0
}

function startBreak() {
  isBreak.value = true
  minutes.value = 5
  seconds.value = 0
}

function closeWindow() {
  window.electronAPI.closeTimerWindow()
}

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId)
  }
})
</script>

<template>
  <div class="bg-base-100 flex h-dvh w-dvw flex-col items-center justify-center gap-6 p-6" style="-webkit-app-region: drag">
    <BaseButton
      variant="ghost"
      icon="x-mark"
      class="absolute top-2 right-2 p-1 opacity-60 hover:opacity-100"
      style="-webkit-app-region: no-drag"
      @click="closeWindow"
    />
    
    <div class="text-center">
      <h1 class="mb-2 text-xl font-bold">
        {{ isBreak ? "Break Time" : "Focus Time" }}
      </h1>
      <div class="text-primary font-mono text-5xl font-bold">
        {{ displayMinutes.toString().padStart(2, "0") }}:{{ displaySeconds.toString().padStart(2, "0") }}
      </div>
    </div>

    <div class="flex gap-2">
      <BaseButton
        v-if="!isRunning"
        variant="primary"
        icon="play"
        class="px-3 py-1 text-sm"
        style="-webkit-app-region: no-drag"
        @click="startTimer"
      >
        Start
      </BaseButton>
      <BaseButton v-else variant="outline" icon="hand-raised" class="px-3 py-1 text-sm" style="-webkit-app-region: no-drag" @click="stopTimer">
        Pause
      </BaseButton>
      <BaseButton variant="ghost" icon="refresh" class="px-3 py-1 text-sm" style="-webkit-app-region: no-drag" @click="resetTimer">
        Reset
      </BaseButton>
    </div>

    <div class="text-base-content/60 text-center text-xs">
      {{ isBreak ? "Take a short break!" : "Stay focused on your task" }}
    </div>
  </div>
</template>
