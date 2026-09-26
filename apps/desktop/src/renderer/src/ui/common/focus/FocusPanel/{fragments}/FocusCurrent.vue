<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {cn} from "@/utils/ui/tailwindcss"
import {useClickCommand} from "../useClickCommand"
import FocusClock from "./FocusClock.vue"

import type {FocusSession} from "@shared/types/focus"

const props = defineProps<{session: FocusSession}>()

const currentIndex = computed(() => props.session.tasks.findIndex((task) => task.taskId === props.session.currentTaskId))
const upNext = computed(() => props.session.tasks.filter((task, index) => index > currentIndex.value && !task.isDone))
const dotCount = computed(() => Math.max(4, props.session.completedIntervals))

const {sendOnClick} = useClickCommand()

function getDotClasses(isFilled: boolean) {
  return cn("bg-base-300 size-2.5 rounded-full", isFilled && "bg-accent")
}
</script>

<template>
  <h3 class="text-xl leading-snug font-semibold">{{ session.tasks[currentIndex]?.title }}</h3>

  <div class="my-auto flex flex-col gap-3.5">
    <FocusClock :session="session" />

    <div v-if="session.mode !== 'timer'" class="flex justify-center gap-2">
      <span v-for="dot in dotCount" :key="dot" data-focus-dot :class="getDotClasses(dot <= session.completedIntervals)" />
    </div>
  </div>

  <div class="flex gap-2">
    <BaseButton v-if="session.phase === 'pause'" variant="primary" icon="play" class="flex-[1.4]" @click="sendOnClick($event, {type: 'resume'})">
      Resume
    </BaseButton>
    <template v-else>
      <BaseButton variant="primary" icon="check" class="flex-[1.4]" @click="sendOnClick($event, {type: 'done'})">Done</BaseButton>
      <BaseButton variant="outline" icon="pause" class="flex-1" @click="sendOnClick($event, {type: 'pause'})">Pause</BaseButton>
    </template>
    <BaseButton variant="outline" icon="stop" class="flex-1" @click="sendOnClick($event, {type: 'stop'})">Stop</BaseButton>
  </div>

  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between">
      <span class="text-base-content/45 text-xs font-medium tracking-wide uppercase">Up next</span>
      <span class="text-base-content/55 text-xs font-medium">{{ currentIndex + 1 }} of {{ session.tasks.length }}</span>
    </div>
    <span v-for="task in upNext" :key="task.taskId" class="text-base-content/50 truncate px-0.5 py-1 text-sm">{{ task.title }}</span>
    <span v-if="!upNext.length" class="text-base-content/50 px-0.5 py-1 text-sm">🏁 No more tasks in this session</span>
  </div>
</template>
