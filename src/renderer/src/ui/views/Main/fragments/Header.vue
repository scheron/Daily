<script setup lang="ts">
import {computed} from "vue"
import {useDevice} from "@/composables/useDevice"
import {toFullDate} from "@/utils/date"

import BaseButton from "@/ui/base/BaseButton.vue"

const props = defineProps<{taskEditorOpen: boolean; activeDay: string}>()
const emit = defineEmits<{createTask: []; toggleSidebar: []}>()

const {isMobile} = useDevice()

const formattedDate = computed(() => toFullDate(props.activeDay ?? new Date()))
</script>

<template>
  <div class="border-base-300 h-header flex items-center justify-between border-b px-4 py-2" style="-webkit-app-region: drag">
    <div class="flex items-center gap-2">
      <BaseButton v-if="isMobile" variant="ghost" icon="sidebar" class="ml-16" style="-webkit-app-region: no-drag" @click="emit('toggleSidebar')" />

      <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
        {{ formattedDate }}
      </h1>
    </div>

    <BaseButton
      v-if="!taskEditorOpen"
      variant="text"
      class="text-accent hover:bg-accent/10 focus-visible-ring focus-visible:ring-accent shrink-0 px-4 py-0"
      icon="plus"
      style="-webkit-app-region: no-drag"
      @click="emit('createTask')"
    >
      New Task
    </BaseButton>
  </div>
</template>
