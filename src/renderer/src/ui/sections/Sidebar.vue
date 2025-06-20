<script setup lang="ts">
import {useDevice} from "@/composables/useDevice"
import {useTasksStore} from "@/stores/tasks.store"
import {useUIStore} from "@/stores/ui.store"
import {toFullDate} from "@/utils/date"

import BaseButton from "@/ui/base/BaseButton.vue"
import BasePanel from "@/ui/base/BasePanel"
import BaseSpinner from "@/ui/base/BaseSpinner.vue"
import CalendarMonth from "@/ui/features/CalendarMonth"
import HelpPanel from "@/ui/features/HelpPanel"
import RecentActiveTasks from "@/ui/features/RecentActiveTasks"
import TagsPanel from "@/ui/features/TagsPanel"
import Themes from "@/ui/features/Themes"
import Logo from "@/ui/misc/Logo.vue"

defineProps<{
  dataLoaded: boolean
  contentHeight: number
}>()

const uiStore = useUIStore()
const tasksStore = useTasksStore()
const {isMacOS} = useDevice()
</script>

<template>
  <aside class="border-base-300 bg-base-100 w-sidebar border-r">
    <div class="border-base-300 h-header flex items-center justify-between border-b px-4 select-none" style="-webkit-app-region: drag">
      <div class="text-accent flex flex-1 items-center gap-2" :class="{'pl-16': isMacOS}">
        <Logo class="h-5" />
        <h2 class="font-mono text-xl font-bold">Daily</h2>
      </div>

      <div class="relative ml-auto flex items-center gap-1 text-sm" style="-webkit-app-region: no-drag">
        {{ tasksStore.activeDay ? toFullDate(tasksStore.activeDay, {short: true}) : "" }}
      </div>
    </div>

    <div :style="{height: contentHeight + 'px'}" class="hide-scrollbar overflow-y-auto">
      <BaseSpinner v-if="!dataLoaded" />

      <template v-else>
        <div class="text-base-content flex size-full flex-col pb-2">
          <div class="hide-scrollbar flex-1 overflow-y-auto">
            <BasePanel opened icon="calendar" group="calendar" label="Calendar" class="border-base-300 border-b" content-class="p-0 bg-base-100">
              <CalendarMonth class="px-2 py-1" />
            </BasePanel>
            <BasePanel icon="history" group="calendar" label="Active Tasks" class="border-base-300 border-b" content-class="p-0 bg-base-100">
              <RecentActiveTasks class="px-2" />
            </BasePanel>
            <BasePanel icon="tags" group="ui" label="Tags" class="border-base-300 border-b" content-class="p-0 bg-base-100">
              <TagsPanel class="px-2" />
            </BasePanel>
            <BasePanel label="Themes" icon="background" group="ui" class="border-base-300 border-b">
              <Themes />
            </BasePanel>
            <BasePanel label="Daily" icon="logo" group="ui" content-class="py-0">
              <HelpPanel />
            </BasePanel>
          </div>

          <div class="mx-4 flex items-center justify-between gap-2">
            <BaseButton variant="ghost" icon="sidebar" @click="uiStore.toggleSidebarCollapse()" />
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>
