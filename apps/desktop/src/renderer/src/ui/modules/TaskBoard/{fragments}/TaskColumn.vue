<script setup lang="ts">
import {computed} from "vue"

import {useTaskColumns} from "@/composables/tasks/useTaskColumns"
import {TASK_COLUMNS} from "@/constants/ui"
import {useUIStore} from "@/stores/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseMenu, {BaseMenuItem} from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {TaskStatus} from "@daily/protocol"

const props = defineProps<{
  status: TaskStatus
}>()

const uiStore = useUIStore()

const columns = useTaskColumns()

const column = computed(() => TASK_COLUMNS.find((s) => s.status === props.status)!)
const tasksCount = computed(() => columns.tasksByStatus.value[props.status].length)
const collapsed = computed(() => columns.isColumnCollapsed(props.status))
const autoCollapseEnabled = computed(() => uiStore.shouldCollapseEmptySections)

const menuItems = computed<BaseMenuItem[]>(() => [
  {
    value: "toggle",
    label: collapsed.value ? "Show" : "Hide",
    icon: collapsed.value ? "eye" : "eye-off",
  },
])

const containerStyle = computed(() => (collapsed.value ? undefined : {flexBasis: "370px", minWidth: "370px"}))

function onMenuSelect(value: BaseMenuItem["value"], hide: () => void) {
  if (value === "toggle") columns.onToggleColumn(column.value.status)
  hide()
}

function getContainerClasses(isCollapsed: boolean) {
  return cn("bg-base-100 relative flex min-w-0 flex-col overflow-hidden", isCollapsed ? "w-17 max-w-17 min-w-17 h-full" : "h-full grow shrink-0")
}

function getIconClasses(titleClass: string) {
  return cn("size-4", titleClass)
}

function getTitleClasses(titleClass: string) {
  return cn("flex items-center gap-2", titleClass)
}

function getCounterClasses(counterClass: string) {
  return cn("rounded-full px-2 py-0.5 text-xs font-medium", counterClass)
}
</script>

<template>
  <div :data-column-status="column.status" :class="getContainerClasses(collapsed)" :style="containerStyle">
    <template v-if="collapsed">
      <div class="dock-surface mx-3 mt-11 flex w-11 flex-col items-center gap-2 rounded-full py-2.5">
        <BaseIcon :name="column.icon" :class="getIconClasses(column.titleClass)" />
        <span :class="getCounterClasses(column.counterClass)">
          {{ tasksCount }}
        </span>
        <BasePopup v-if="!autoCollapseEnabled" hide-header position="end" container-class="min-w-32 p-0">
          <template #trigger="{toggle}">
            <BaseButton variant="ghost" icon="dots-horizontal" tooltip="Column menu" class="size-6 p-0" @click="toggle" />
          </template>
          <template #default="{hide}">
            <BaseMenu :items="menuItems" @select="onMenuSelect($event, hide)" />
          </template>
        </BasePopup>
      </div>
    </template>

    <template v-else>
      <div class="absolute inset-x-0 top-11 z-10 flex h-9 items-center justify-between px-4">
        <div :class="getTitleClasses(column.titleClass)">
          <BaseIcon :name="column.icon" class="size-4" />
          <span class="text-sm font-medium uppercase tracking-wide">{{ column.label }}</span>
          <span :class="getCounterClasses(column.counterClass)">
            {{ tasksCount }}
          </span>
        </div>
        <BasePopup v-if="!autoCollapseEnabled" hide-header position="end" container-class="min-w-32 p-0">
          <template #trigger="{toggle}">
            <BaseButton variant="ghost" icon="dots-horizontal" tooltip="Column menu" class="size-6 p-0" @click="toggle" />
          </template>
          <template #default="{hide}">
            <BaseMenu :items="menuItems" @select="onMenuSelect($event, hide)" />
          </template>
        </BasePopup>
      </div>

      <div class="pt-22 absolute inset-0 flex min-w-0 overflow-y-auto overflow-x-hidden px-1.5 pb-4">
        <slot />

        <div
          v-if="!tasksCount && !columns.isDragging.value"
          class="text-base-content/70 pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-lg text-center"
        >
          <div class="bg-base-200 rounded-full p-3">
            <BaseIcon name="empty" class="size-5" />
          </div>
          <span class="text-sm">No {{ column.emptyLabel }} tasks</span>
        </div>
      </div>

      <div
        class="from-base-100 via-base-100/60 h-23 bg-linear-to-b pointer-events-none absolute inset-x-0 top-0 z-[5] from-35% via-70% to-transparent"
      />
      <div class="to-base-100/70 bg-linear-to-b pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-12 from-transparent" />
    </template>
  </div>
</template>
