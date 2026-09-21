<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import {cn} from "@/utils/ui/tailwindcss"
import {buttonColorVariant} from "./variants"

import type {TooltipPlacement} from "@/directives/vTooltip"
import type {IconName} from "@/ui/base/BaseIcon"
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
  iconClass?: HtmlHTMLAttributes["class"]
  class?: HtmlHTMLAttributes["class"]
}>()

const colorClass = buttonColorVariant(props)

function getButtonClasses(hasContent: boolean) {
  return cn(colorClass.value, hasContent ? "gap-1" : "p-1", props.class, props.disabled && "cursor-auto opacity-50")
}

function getIconClasses(isSpinning: boolean) {
  return cn(isSpinning && "animate-spin", props.iconClass)
}
</script>

<template>
  <button v-tooltip="{content: tooltip, placement: tooltipPosition}" :class="getButtonClasses(!!$slots.default)" :disabled="disabled || loading">
    <BaseIcon v-if="loading" name="spinner" :class="getIconClasses(true)" />
    <template v-else>
      <BaseIcon v-if="icon" :name="icon" :class="getIconClasses(false)" />
      <slot />
    </template>
  </button>
</template>
