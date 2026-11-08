<script setup lang="ts">
import {computed} from "vue"

import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {buttonColorVariant, buttonIconSizeVariant, buttonSizeVariant, iconButtonSizeVariant} from "./variants"

import type {TooltipPlacement} from "@/directives/v-tooltip"
import type {IconName} from "@/types/icons"
import type {HtmlHTMLAttributes} from "vue"
import type {ButtonColorVariant, ButtonSize} from "./variants"

const props = defineProps<{
  variant?: ButtonColorVariant
  size?: ButtonSize
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  tooltip?: string
  tooltipPosition?: TooltipPlacement
  class?: HtmlHTMLAttributes["class"]
}>()

const colorClass = buttonColorVariant(props)
const sizeClass = buttonSizeVariant(props)
const iconButtonSizeClass = iconButtonSizeVariant(props)
const iconSizeClass = buttonIconSizeVariant(props)
const spinnerClass = computed(() => cn(iconSizeClass.value, "animate-spin"))

function getButtonClasses(hasContent: boolean) {
  return cn(
    [hasContent ? sizeClass.value : iconButtonSizeClass.value],
    colorClass.value,
    props.class,
    "aria-disabled:cursor-auto aria-disabled:opacity-50",
    {"cursor-auto opacity-50": props.disabled},
  )
}
</script>

<template>
  <button v-tooltip="{content: tooltip, placement: tooltipPosition}" :class="getButtonClasses(!!$slots.default)" :disabled="disabled || loading">
    <BaseIcon v-if="loading" name="spinner" :class="spinnerClass" />
    <template v-else>
      <slot name="icon" :class="iconSizeClass">
        <BaseIcon v-if="icon" :name="icon" :class="iconSizeClass" />
      </slot>
      <slot />
    </template>
  </button>
</template>
