<script setup lang="ts">
import {useTaskEditor} from "@/ui/modules/RightPanel/composables/useTaskEditor"
import DetailsSheet from "./{fragments}/DetailsSheet.vue"
import SummaryRow from "./{fragments}/SummaryRow.vue"

import type {Task} from "@daily/protocol"

defineProps<{task: Task}>()

const {isDetailsOpen, closeDetails} = useTaskEditor()
</script>

<template>
  <SummaryRow :task="task" />

  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div v-if="isDetailsOpen" class="absolute inset-0 z-10 bg-black/45" @click="closeDetails" />
  </Transition>

  <Transition
    enter-active-class="transition-transform duration-200 ease-out"
    enter-from-class="-translate-y-full"
    leave-active-class="transition-transform duration-150 ease-in"
    leave-to-class="-translate-y-full"
  >
    <DetailsSheet v-if="isDetailsOpen" :task="task" />
  </Transition>
</template>
