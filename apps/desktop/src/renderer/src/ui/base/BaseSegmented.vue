<script setup lang="ts" generic="T extends string">
import {computed, useTemplateRef} from "vue"

import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/ui/base/BaseIcon"

type Option = {value: T; label: string; icon?: IconName; activeClass?: string}

const props = defineProps<{
  options: Option[]
}>()

const model = defineModel<T>({required: true})

const optionEls = useTemplateRef<HTMLElement[]>("optionEls")

const ARROW_STEPS: Record<string, number> = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}

const tabStopIndex = computed(() =>
  Math.max(
    0,
    props.options.findIndex((opt) => opt.value === model.value),
  ),
)

function getOptionClasses(isActive: boolean, opt: Option) {
  return cn(
    "focus-visible-accent cursor-pointer rounded transition-colors outline-none",
    opt.icon ? "flex items-center px-1.5 py-1" : "px-2.5 py-1",
    isActive ? (opt.activeClass ?? "bg-accent text-base-100") : "text-base-content/60 hover:text-base-content",
  )
}

function onKeydown(event: KeyboardEvent, index: number) {
  const step = ARROW_STEPS[event.key]
  if (!step) return

  event.preventDefault()
  const next = (index + step + props.options.length) % props.options.length
  model.value = props.options[next].value
  optionEls.value?.[next]?.focus()
}
</script>

<template>
  <div role="radiogroup" class="bg-base-300 inline-flex items-center gap-0.5 rounded-md p-0.5 text-xs">
    <button
      v-for="(opt, index) in options"
      :key="opt.value"
      ref="optionEls"
      v-tooltip="opt.icon ? opt.label : ''"
      type="button"
      role="radio"
      :aria-checked="model === opt.value"
      :aria-label="opt.icon ? opt.label : undefined"
      :tabindex="index === tabStopIndex ? 0 : -1"
      :class="getOptionClasses(model === opt.value, opt)"
      @click="model = opt.value"
      @keydown="onKeydown($event, index)"
    >
      <BaseIcon v-if="opt.icon" :name="opt.icon" class="size-4" />
      <template v-else>{{ opt.label }}</template>
    </button>
  </div>
</template>
