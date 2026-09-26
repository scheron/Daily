<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {useClickCommand} from "../useClickCommand"
import FocusChecklist from "./FocusChecklist.vue"

import type {FocusSession} from "@shared/types/focus"

const props = defineProps<{session: FocusSession}>()

const summaryLine = computed(() => {
  const {tasks, mode, completedIntervals} = props.session
  const doneCount = tasks.filter((task) => task.isDone).length
  const minutes = Math.round(tasks.reduce((sum, task) => sum + task.focusedSeconds, 0) / 60)
  const parts = [`${doneCount} of ${tasks.length} done`, `${minutes} min focused`]
  const pomodoros = `${completedIntervals} ${completedIntervals === 1 ? "pomodoro" : "pomodoros"}`
  const shownParts = mode === "timer" ? parts : parts.concat(pomodoros)

  return shownParts.join(" · ")
})

const {sendOnClick} = useClickCommand()
</script>

<template>
  <h3 class="text-lg font-semibold">Session done</h3>
  <span class="text-base-content/60 text-sm">{{ summaryLine }}</span>

  <FocusChecklist :tasks="session.tasks" should-show-focus-time />

  <BaseButton variant="primary" class="w-full" @click="sendOnClick($event, {type: 'close'})">Close</BaseButton>
</template>
