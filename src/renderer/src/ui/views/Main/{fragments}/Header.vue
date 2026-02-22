<script setup lang="ts">
import {computed} from "vue"

import {toFullDate} from "@shared/utils/date/formatters"
import {useUIStore} from "@/stores/ui.store"
import {useDevice} from "@/composables/useDevice"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKey"
import BaseButton from "@/ui/base/BaseButton.vue"

const props = defineProps<{taskEditorOpen: boolean; activeDay: string}>()
const emit = defineEmits<{createTask: []; toggleSidebar: []}>()

const {isDesktop} = useDevice()
const uiStore = useUIStore()
const formattedDate = computed(() => toFullDate(props.activeDay ?? new Date()))
const showToggleButton = computed(() => {
  if (isDesktop.value) return uiStore.isSidebarCollapsed
  return true
})
</script>

<template>
  <div class="app-header border-base-300 h-header flex items-center justify-between border-b px-4 py-2" style="-webkit-app-region: drag">
    <div class="flex min-w-0 items-center gap-2 pl-16">
      <BaseButton
        v-if="showToggleButton"
        variant="ghost"
        icon="sidebar"
        :tooltip="isDesktop ? `Expand (${toShortcutKeys('ui:toggle-sidebar')})` : 'Menu'"
        style="-webkit-app-region: no-drag"
        @click="emit('toggleSidebar')"
      />
      <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
        {{ formattedDate }}
      </h1>
    </div>

    <BaseButton
      v-if="!taskEditorOpen"
      variant="text"
      class="text-accent hover:bg-accent/10 focus-visible-ring focus-visible:ring-accent size-8 shrink-0 p-0"
      icon="plus"
      :tooltip="`Create (${toShortcutKeys('tasks:create')})`"
      style="-webkit-app-region: no-drag"
      @click="emit('createTask')"
    />
  </div>
</template>
