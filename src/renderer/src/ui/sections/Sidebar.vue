<script setup lang="ts">
import {useDevice} from "@/composables/useDevice"

import BaseButton from "@/ui/base/BaseButton.vue"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import Calendar from "@/ui/features/Calendar"
import InfoPanel from "@/ui/features/InfoPanel"
import RecentActiveTasks from "@/ui/features/RecentActiveTasks"
import Logo from "@/ui/misc/Logo.vue"
import {useUIStore} from "@/stores/ui.store"

defineProps<{
  isDataLoaded: boolean
  contentHeight: number
}>()

const uiStore = useUIStore()
const {isDesktop} = useDevice()
</script>

<template>
  <aside :class="['border-base-300 bg-base-100 hidden shrink-0 border-r md:block', uiStore.isSidebarCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar']">
    <div class="border-base-300 h-header flex items-center justify-between border-b pr-4 pl-20 select-none" style="-webkit-app-region: drag">
      <template v-if="uiStore.isSidebarCollapsed">
        <Logo class="text-accent mx-auto h-5" />
      </template>

      <template v-else>
        <div class="text-accent flex flex-1 items-center gap-2">
          <Logo class="h-5" />
          <h2 class="font-mono text-xl font-bold">Daily</h2>
        </div>

        <div class="relative ml-auto flex items-center gap-1" style="-webkit-app-region: no-drag">
          <BaseButton variant="ghost" :icon="uiStore.isInfoPanelOpen ? 'cog-off' : 'cog'" @click="uiStore.toggleIsInfoPanelOpen()" />
        </div>
      </template>
    </div>

    <div :style="{height: contentHeight + 'px'}" class="hide-scrollbar overflow-y-auto">
      <BaseSpinner v-if="!isDataLoaded" />

      <template v-else>
        <div class="text-base-content flex size-full flex-col pb-2">
          <div class="flex-1 overflow-y-auto">
            <InfoPanel v-if="uiStore.isInfoPanelOpen" />
            <template v-else>
              <Calendar class="my-4 px-2" />

              <template v-if="!uiStore.isSidebarCollapsed">
                <div class="bg-accent/10 mx-2 h-px"></div>
                <RecentActiveTasks class="mt-4" />
              </template>
            </template>
          </div>

          <div
            v-if="!uiStore.isInfoPanelOpen"
            class="flex items-center gap-2"
            :class="[uiStore.isSidebarCollapsed ? 'mx-auto flex-col' : 'mx-2 justify-between']"
          >
            <BaseButton variant="ghost" icon="export" @click="uiStore.toggleIsExportTaskOpen()" />
            <BaseButton v-if="isDesktop" variant="ghost" icon="sidebar" @click="uiStore.toggleSidebarCollapse()" />
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
