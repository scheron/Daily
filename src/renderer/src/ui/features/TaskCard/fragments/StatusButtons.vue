<script lang="ts" setup>
import {HtmlHTMLAttributes} from "vue"
import {cn} from "@/utils/tailwindcss"

import type {TasksFilter} from "@/types/filters"
import type {TaskStatus} from "@/types/tasks"
import type {IconName} from "@/ui/base/BaseIcon"

import BaseIcon from "@/ui/base/BaseIcon"

const props = defineProps<{status: TaskStatus}>()
const emit = defineEmits<{"change-status": [status: TaskStatus]}>()

type StatusButton = {
  label: string
  icon: IconName
  value: Exclude<TasksFilter, "all">
  activeClass: HtmlHTMLAttributes["class"]
  inactiveClass: HtmlHTMLAttributes["class"]
  tooltip: string
}

const FILTERS: StatusButton[] = [
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

function getButtonClass(classes: HtmlHTMLAttributes["class"]) {
  const baseClass = `
    rounded-md px-2 py-0.5 text-xs
    text-base-content/50
    focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-base-content
    transition-colors duration-200 outline-none
  `

  return cn(baseClass, classes)
}
</script>

<template>
  <div class="w-auto shrink-0">
    <div class="bg-accent/5 border-accent/5 inline-flex w-auto items-center gap-1 rounded-lg border p-1">
      <button
        v-for="option in FILTERS"
        :key="option.value"
        v-tooltip="{disabled: props.status === option.value, content: option.tooltip, placement: 'bottom-end'}"
        :class="getButtonClass(props.status === option.value ? option.activeClass : option.inactiveClass)"
        @click="emit('change-status', option.value)"
      >
        <BaseIcon :name="option.icon" class="size-5" />
      </button>
    </div>
  </div>
</template>
