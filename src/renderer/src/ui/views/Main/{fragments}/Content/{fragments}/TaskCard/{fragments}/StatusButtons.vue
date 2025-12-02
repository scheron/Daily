<script lang="ts" setup>
import {useVModel} from "@vueuse/core"

import AnimatedTabs from "@/ui/common/misc/AnimatedTabs"

import {STATUS_BUTTONS} from "../constants"

import type {TaskStatus} from "@shared/types/storage"

const props = defineProps<{status: TaskStatus}>()
const emit = defineEmits<{"update:status": [status: TaskStatus]}>()
const activeStatus = useVModel(props, "status", emit)
</script>

<template>
  <div ref="container" class="w-auto shrink-0">
    <AnimatedTabs
      v-model:tab="activeStatus"
      :tabs="STATUS_BUTTONS"
      class="bg-accent/5 border-accent/5 inline-flex w-auto items-center gap-2 rounded-lg border p-1"
      tab-class="flex items-center justify-center gap-1 rounded-md px-2 py-0.5 text-sm text-base-content/50 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent transition-colors duration-200 outline-none"
    />
  </div>
</template>
