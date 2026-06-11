<script setup lang="ts">
import {computed} from "vue"
import VueDraggable from "vuedraggable"

import BaseIcon from "@/ui/base/BaseIcon"

import {BOARD_COLUMNS, DRAGGABLE_ATTRS} from "../../../model/constants"
import {otherStatuses} from "./viewStatuses"

import type {Task, TaskStatus} from "@shared/types/storage"
import type {DraggableChangeEvent} from "./viewStatuses"

const props = defineProps<{
  visible: boolean
  currentView: TaskStatus
  lists: Record<TaskStatus, Task[]>
}>()

const emit = defineEmits<{change: [status: TaskStatus, event: DraggableChangeEvent]}>()

const ZONE_HIGHLIGHT: Record<TaskStatus, string> = {
  active: "has-[.draggable-task-ghost]:border-error has-[.draggable-task-ghost]:bg-error/10",
  done: "has-[.draggable-task-ghost]:border-success has-[.draggable-task-ghost]:bg-success/10",
  discarded: "has-[.draggable-task-ghost]:border-warning has-[.draggable-task-ghost]:bg-warning/10",
}

const zones = computed(() => otherStatuses(props.currentView).map((status) => BOARD_COLUMNS.find((column) => column.status === status)!))
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-150"
    enter-from-class="translate-y-full"
    leave-active-class="transition-transform duration-150"
    leave-to-class="translate-y-full"
  >
    <div v-show="props.visible" class="flex gap-1.5">
      <VueDraggable
        v-for="zone in zones"
        :key="zone.status"
        :list="props.lists[zone.status]"
        item-key="id"
        :sort="false"
        v-bind="DRAGGABLE_ATTRS"
        class="bg-base-100/95 border-base-300 flex h-20 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed backdrop-blur-sm transition-colors"
        :class="[zone.titleClass, ZONE_HIGHLIGHT[zone.status]]"
        @change="emit('change', zone.status, $event)"
      >
        <template #header>
          <BaseIcon :name="zone.icon" class="pointer-events-none size-5" />
          <span class="pointer-events-none text-sm font-semibold">{{ zone.label }}</span>
        </template>
        <template #item>
          <div class="hidden" />
        </template>
      </VueDraggable>
    </div>
  </Transition>
</template>
