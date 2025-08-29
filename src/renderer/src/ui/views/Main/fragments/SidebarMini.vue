<script setup lang="ts">
import {useUIStore} from "@/stores/ui.store"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import CalendarWeek from "@/ui/features/CalendarWeek"

defineProps<{
  dataLoaded: boolean
  contentHeight: number
}>()

const uiStore = useUIStore()

</script>

<template>
  <aside class="border-base-300 bg-base-100 w-sidebar-collapsed border-r">
    <div class="border-base-300 h-header flex items-center justify-between border-b pr-4 pl-4 select-none" style="-webkit-app-region: drag"></div>

    <div :style="{height: contentHeight + 'px'}" class="hide-scrollbar overflow-y-auto">
      <BaseSpinner v-if="!dataLoaded" />

      <template v-else>
        <div class="text-base-content flex size-full flex-col pb-4">
          <div class="hide-scrollbar flex-1 overflow-y-auto px-1 py-4">
            <CalendarWeek />
          </div>

          <div class="mx-auto flex flex-col items-center gap-2">
            <BaseButton variant="ghost" icon="sidebar" @click="uiStore.toggleSidebarCollapse()" />
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
