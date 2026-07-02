<script setup lang="ts">
import {computed} from "vue"

import {useUIStore} from "@/stores/ui"
import {COLUMN_MIN_WIDTH, TASK_COLUMNS} from "@/constants/ui"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseMenu, {BaseMenuItem} from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import {useTaskColumns} from "../../../../composables/tasks/useTaskColumns"

import type {TaskStatus} from "@shared/types/storage"

const props = defineProps<{
  status: TaskStatus
}>()

const columns = useTaskColumns()
const uiStore = useUIStore()

const column = computed(() => TASK_COLUMNS.find((s) => s.status === props.status)!)
const tasksCount = computed(() => columns.tasksByStatus.value[props.status].length)
const collapsed = computed(() => columns.isColumnCollapsed(props.status))
const autoCollapseEnabled = computed(() => uiStore.sectionsAutoCollapseEmpty)

const menuItems = computed<BaseMenuItem[]>(() => [
  {
    value: "toggle",
    label: collapsed.value ? "Show" : "Hide",
    icon: collapsed.value ? "eye" : "eye-off",
  },
])

function onMenuSelect(value: BaseMenuItem["value"] | null, hide: () => void) {
  if (value === "toggle") columns.onToggleColumn(column.value.status)
  hide()
}

const containerClass = computed(() => (collapsed.value ? "w-20 max-w-20 min-w-20 h-full" : "h-full grow shrink-0"))
const containerStyle = computed(() => (collapsed.value ? undefined : {flexBasis: `${COLUMN_MIN_WIDTH}px`, minWidth: `${COLUMN_MIN_WIDTH}px`}))
</script>

<template>
  <div
    :data-column-status="column.status"
    class="bg-base-100 flex min-w-0 flex-col overflow-hidden"
    :class="containerClass"
    :style="containerStyle"
    @dragenter="columns.onColumnDragEnter(column.status)"
  >
    <template v-if="collapsed">
      <div class="flex h-full flex-col items-center justify-start gap-2 py-3">
        <BaseIcon :name="column.icon" class="size-4" :class="column.titleClass" />
        <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="column.counterClass">
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
      <div class="border-base-300 h-toolbar flex items-center justify-between border-b px-4 py-2">
        <div class="flex items-center gap-2" :class="column.titleClass">
          <BaseIcon :name="column.icon" class="size-4" />
          <span class="text-sm font-medium tracking-wide uppercase">{{ column.label }}</span>
          <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="column.counterClass">
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

      <div class="relative flex min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 py-4">
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
    </template>
  </div>
</template>
