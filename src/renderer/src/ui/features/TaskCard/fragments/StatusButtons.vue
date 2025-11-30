<script lang="ts" setup>
import {HtmlHTMLAttributes, nextTick, ref, useTemplateRef} from "vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {TasksFilter} from "@/types/filters"
import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@shared/types/storage"

import BaseIcon from "@/ui/base/BaseIcon"

const props = defineProps<{status: TaskStatus}>()
const emit = defineEmits<{"change-status": [status: TaskStatus]}>()

const containerRef = useTemplateRef<HTMLDivElement>("container")

const isAnimating = ref(false)

type StatusButton = {
  label: string
  icon: IconName
  value: Exclude<TasksFilter, "all">
  activeClass: HtmlHTMLAttributes["class"]
  inactiveClass: HtmlHTMLAttributes["class"]
  tooltip: string
}

const BUTTONS: StatusButton[] = [
  {
    label: "Active",
    icon: "fire",
    value: "active",
    tooltip: "Set as active",
    activeClass: "text-error bg-error/10 border-error hover:text-error",
    inactiveClass: "hover:text-error",
  },
  {
    label: "Discarded",
    icon: "archive",
    value: "discarded",
    tooltip: "Discard task",
    activeClass: "text-warning bg-warning/10 border-warning hover:text-warning",
    inactiveClass: "hover:text-warning",
  },
  {
    label: "Done",
    icon: "check-check",
    value: "done",
    tooltip: "Mark as done",
    activeClass: "text-success bg-success/10 border-success hover:text-success",
    inactiveClass: "hover:text-success",
  },
]

function getButtonClass(classes: HtmlHTMLAttributes["class"]) {
  const baseClass = `
    flex items-center justify-center gap-1
    rounded-md px-2 py-0.5 text-sm
    text-base-content/50
    focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent
    transition-colors duration-200 outline-none
  `

  return cn(baseClass, classes)
}

const ANIM_HIDE: [Keyframe[], KeyframeAnimationOptions] = [
  [
    {maxWidth: "100px", opacity: "1", transform: "translateX(0)", visibility: "visible"},
    {maxWidth: "0", opacity: "0", transform: "translateX(-10px)", visibility: "hidden"},
  ],
  {duration: 200, easing: "ease", fill: "forwards"},
]

const ANIM_SHOW: [Keyframe[], KeyframeAnimationOptions] = [
  [
    {maxWidth: "0", opacity: "0", transform: "translateX(-10px)", visibility: "hidden"},
    {maxWidth: "100px", opacity: "1", transform: "translateX(0)", visibility: "visible"},
  ],
  {duration: 300, easing: "ease", fill: "forwards"},
]

async function onSelectStatus(status: TaskStatus) {
  if (isAnimating.value) return
  if (!containerRef.value) return

  isAnimating.value = true

  const currentButton = containerRef.value.querySelector<HTMLButtonElement>(`[data-status="${props.status}"][data-name="button"]`)
  const targetButton = containerRef.value.querySelector<HTMLButtonElement>(`[data-status="${status}"][data-name="button"]`)

  if (!currentButton || !targetButton || currentButton === targetButton) {
    isAnimating.value = false
    return
  }

  const currentLabel = currentButton.lastElementChild
  const targetLabel = targetButton.lastElementChild

  await currentLabel?.animate(...ANIM_HIDE)?.finished

  emit("change-status", status)

  await nextTick()

  await targetLabel?.animate(...ANIM_SHOW)?.finished

  isAnimating.value = false
}
</script>

<template>
  <div ref="container" class="w-auto shrink-0">
    <div class="bg-accent/5 border-accent/5 inline-flex w-auto items-center gap-2 rounded-lg border p-1">
      <button
        v-for="option in BUTTONS"
        :key="option.value"
        v-tooltip="{disabled: props.status === option.value, content: option.tooltip, placement: 'bottom-end'}"
        data-name="button"
        :data-status="option.value"
        :class="[{active: props.status === option.value}, getButtonClass(props.status === option.value ? option.activeClass : option.inactiveClass)]"
        @click="onSelectStatus(option.value)"
      >
        <BaseIcon :name="option.icon" class="size-5" />
        <span
          class="invisible max-w-0 opacity-0 transition-opacity"
          :class="{'visible max-w-full opacity-100 transition-opacity': props.status === option.value}"
          :data-status="option.value"
          data-name="label"
        >
          {{ option.label }}
        </span>
      </button>
    </div>
  </div>
</template>
