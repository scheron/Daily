<script setup lang="ts">
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKeys"

const emit = defineEmits<{createTask: []}>()

const uiStore = useUIStore()
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <div v-if="!uiStore.isCalendarDockExpanded" class="dock-surface absolute right-3.5 bottom-3.5 z-20 flex h-8 items-center rounded-full">
      <BaseButton
        variant="primary-ghost"
        icon="plus"
        icon-class="size-4"
        class="h-8 min-w-20 py-0"
        :tooltip="`New task (${toShortcutKeys('tasks:create')})`"
        @click="emit('createTask')"
      >
        New
      </BaseButton>
    </div>
  </BaseAnimation>
</template>
