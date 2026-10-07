<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import {getPriorityLevel} from "@/utils/priority/getPriorityLevel"

import type {TaskPriority} from "@daily/protocol"

const props = defineProps<{priority: TaskPriority}>()

const color = computed(() => getPriorityLevel(props.priority).color)
</script>

<template>
  <BaseIcon :name="`priority-${priority}`" :style="{color}" aria-hidden="true" />
</template>
