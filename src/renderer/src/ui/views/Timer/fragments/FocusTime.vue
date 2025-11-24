<script setup lang="ts">
import {computed, ref} from "vue"
import {useIntervalFn} from "@vueuse/core"
import {Task} from "@shared/types/storage"
import {toLocaleTime} from "@shared/utils/date/formatters"

// TODO: Maybe we can sound when timer is finished?

import BaseButton from "@/ui/base/BaseButton.vue"

const props = defineProps<{task: Task}>()

const emit = defineEmits<{timerChanged: [time: number]}>()

const _spentTime = ref(props.task.spentTime)
const isTimerFinished = computed(() => props.task.status !== "active")

const {isActive, pause, resume} = useIntervalFn(
  () => {
    if (!isTimerFinished.value) _spentTime.value++
    else pause()
    emit("timerChanged", _spentTime.value)
  },
  1000,
  {immediate: false},
)
</script>

<template>
  <main class="flex size-full flex-1 flex-col items-center justify-center gap-4">
    <div class="text-center">
      <h1 class="mb-2 text-xl font-bold">Progress {{ Math.round((_spentTime / props.task.estimatedTime) * 100) }}%</h1>
      <div class="text-base-content font-mono text-4xl font-bold">{{ toLocaleTime(_spentTime) }}</div>
      <div class="text-base-content/60 font-mono text-base font-bold">{{ toLocaleTime(props.task.estimatedTime) }}</div>
    </div>

    <div class="flex h-10 w-full gap-2 px-8" style="-webkit-app-region: no-drag">
      <BaseButton
        v-if="!isActive && !isTimerFinished"
        variant="primary"
        icon="play"
        class="relative w-full flex-row-reverse gap-2 border border-transparent px-3 py-1 text-sm"
        @click="resume"
      >
        Start
      </BaseButton>

      <BaseButton
        v-else-if="isActive"
        variant="outline"
        icon="hand-raised"
        class="relative w-full flex-row-reverse gap-2 px-3 py-1 text-sm"
        @click="pause"
      >
        Stop
      </BaseButton>
    </div>
  </main>
</template>
