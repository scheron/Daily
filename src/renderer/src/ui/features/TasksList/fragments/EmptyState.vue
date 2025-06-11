<script setup lang="ts">
import {computed} from "vue"

import {toDayLabel} from "@/utils/date"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"

import type {TasksFilter} from "@/types/filters"

const props = defineProps<{date?: string; filter: TasksFilter}>()
const emit = defineEmits<{"create-task": []}>()

const title = computed(() => {
  if (props.filter === "active") return "active"
  if (props.filter === "done") return "completed"
  if (props.filter === "discarded") return "discarded"
  return "any"
})

function onCreateTask() {
  emit("create-task")
}
</script>

<template>
  <div class="flex size-full flex-1 flex-col items-center justify-center p-8 text-center">
    <div class="bg-accent/20 mb-6 rounded-full p-4">
      <BaseIcon name="empty" class="text-accent size-12" />
    </div>

    <h3 class="text-base-content mb-2 flex flex-col text-xl">
      <b v-if="date" class="text-accent">{{ toDayLabel(date) }}</b>
      <span>
        No <b v-if="date" class="text-accent">{{ title }}</b> tasks
      </span>
    </h3>

    <BaseButton variant="primary" icon="plus" class="mt-8" @click="onCreateTask"> Add Task </BaseButton>
  </div>
</template>
