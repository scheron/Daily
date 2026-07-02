<script setup lang="ts">
import {computed, useSlots} from "vue"

import {cn} from "@/utils/ui/tailwindcss"
import BaseIcon from "@/ui/base/BaseIcon"

import {buttonColorVariant, ButtonColorVariant, buttonSizeVariant, ButtonSizeVariant} from "./variants"

import type {IconName} from "@/ui/base/BaseIcon"
import type {TooltipPlacement} from "@/utils/ui/TooltipController"
import type {HtmlHTMLAttributes} from "vue"

const props = defineProps<{
  variant?: ButtonColorVariant
  size?: ButtonSizeVariant
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  tooltip?: string
  tooltipPosition?: TooltipPlacement
  iconClass?: HtmlHTMLAttributes["class"]
  class?: HtmlHTMLAttributes["class"]
}>()

const slots = useSlots()

const classes = computed(() =>
  cn(
    buttonColorVariant(props).value,
    buttonSizeVariant(props).value,
    slots.default ? "gap-1 px-3 py-1.5" : "p-1",
    props.class,
    props.disabled && "cursor-auto opacity-50",
  ),
)
</script>

<template>
  <button v-tooltip="{content: tooltip, placement: tooltipPosition}" :class="classes" :disabled="disabled || loading">
    <BaseIcon v-if="loading" name="spinner" class="animate-spin" :class="iconClass" />
    <template v-else>
      <BaseIcon v-if="icon" :name="icon" :class="iconClass" />
      <slot />
    </template>
  </button>
</template>
