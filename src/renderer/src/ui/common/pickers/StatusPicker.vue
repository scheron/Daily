<script lang="ts" setup>
import {computed, HtmlHTMLAttributes} from "vue"

import {TaskStatus} from "@shared/types/storage"
import {cn} from "@/utils/ui/tailwindcss"
import BaseButton from "@/ui/base/BaseButton.vue"
import {IconName} from "@/ui/base/BaseIcon"
import BasePopup from "@/ui/base/BasePopup.vue"

import {TasksFilter} from "@/types/common"

const props = withDefaults(
  defineProps<{
    status?: TaskStatus
  }>(),
  {
    status: "active",
  },
)

const emit = defineEmits<{"update:status": [status: TaskStatus]}>()

type StatusButton = {
  label: string
  icon: IconName
  value: Exclude<TasksFilter, "all">
  activeClass: HtmlHTMLAttributes["class"]
  inactiveClass: HtmlHTMLAttributes["class"]
  tooltip: string
}

const TASKS_STATUSES: StatusButton[] = [
  {
    label: "Active",
    icon: "fire",
    value: "active",
    tooltip: "Set as active",
    activeClass: "bg-error/20 text-base-content hover:text-base-content",
    inactiveClass: "hover:text-base-content hover:bg-error/20",
  },
  {
    label: "Discarded",
    icon: "archive",
    value: "discarded",
    tooltip: "Discard task",
    activeClass: "hover:bg-warning/30 bg-warning/20 text-base-content hover:text-base-content",
    inactiveClass: "hover:text-base-content hover:bg-warning/30",
  },
  {
    label: "Done",
    icon: "check-check",
    value: "done",
    tooltip: "Mark as done",
    activeClass: "bg-success/30 hover:bg-success/40 text-base-content hover:text-base-content",
    inactiveClass: "hover:text-base-content hover:bg-success/30",
  },
]

const currentStatus = computed(() => TASKS_STATUSES.find((status) => status.value === props.status))

function onChangeStatus(status: TaskStatus) {
  if (props.status === status) return
  emit("update:status", status)
}

function getButtonClass(classes: HtmlHTMLAttributes["class"]) {
  const baseClass = `
    rounded-md px-2 py-0.5 text-xs
    text-base-content/50
    focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent
    transition-colors duration-200 outline-none
  `

  return cn(baseClass, classes)
}
</script>

<template>
  <BasePopup hide-header container-class="p-0 min-w-20" position="center" content-class="p-0 py-2">
    <template #trigger="{toggle}">
      <BaseButton
        :icon="currentStatus!.icon"
        class="justify-start py-0.5"
        :tooltip="currentStatus!.tooltip"
        icon-class="size-4"
        :class="getButtonClass('')"
        variant="secondary"
        @click="toggle"
      >
        {{ currentStatus!.label }}
      </BaseButton>
    </template>

    <div class="flex flex-col items-center gap-2 text-xs">
      <div class="text-base-content/60 flex flex-col items-center justify-center gap-2 px-1 py-0.5 font-mono font-bold">
        <BaseButton
          v-for="status in TASKS_STATUSES"
          :key="status.value"
          class="w-full justify-start px-2 py-0.5"
          icon-class="size-4"
          variant="ghost"
          :class="getButtonClass(props.status === status.value ? status.activeClass : status.inactiveClass)"
          :icon="status.icon"
          :tooltip="status.tooltip"
          @click="onChangeStatus(status.value)"
        >
          {{ status.label }}
        </BaseButton>
      </div>
    </div>
  </BasePopup>
</template>
