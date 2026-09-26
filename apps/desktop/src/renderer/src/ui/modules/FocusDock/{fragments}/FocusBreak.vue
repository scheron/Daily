<script setup lang="ts">
import {computed} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {useClickCommand} from "../useClickCommand"
import FocusChecklist from "./FocusChecklist.vue"
import FocusClock from "./FocusClock.vue"

import type {FocusSession} from "@shared/types/focus"

const props = defineProps<{session: FocusSession}>()

const currentTitle = computed(() => props.session.tasks.find((task) => task.taskId === props.session.currentTaskId)?.title)

const {sendOnClick} = useClickCommand()
</script>

<template>
  <span class="text-success text-center text-sm font-semibold">Break</span>

  <FocusClock :session="session" />

  <span class="text-base-content/60 truncate text-center text-sm">Next: {{ currentTitle }}</span>
  <BaseButton variant="outline" class="self-center" @click="sendOnClick($event, {type: 'skip-break'})">Skip break</BaseButton>

  <FocusChecklist :tasks="session.tasks" />
</template>
