<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import BaseIcon from "./BaseIcon/BaseIcon.vue"

import type {Placement} from "floating-vue"
import type {HtmlHTMLAttributes} from "vue"
import type {IconName} from "./BaseIcon"

const props = defineProps<{
  variant?: "primary" | "secondary" | "ghost" | "text" | "outline"
  size?: "sm" | "md" | "lg"
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  tooltip?: string
  tooltipPosition?: Placement
  iconClass?: HtmlHTMLAttributes["class"]
  class?: HtmlHTMLAttributes["class"]
}>()

const slots = defineSlots<{
  default?: () => any
}>()

const variantClasses = {
  primary: `
  bg-accent/20 text-accent
  hover:bg-accent/30 
  disabled:hover:bg-accent/20 
  focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent
  `,
  secondary: `
  bg-base-200 text-base-content 
  hover:bg-base-300 
  focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent
  disabled:hover:bg-base-200 
  `,
  ghost: `
  bg-transparent text-base-content 
  hover:bg-base-200 
  focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent
  disabled:hover:bg-transparent
  `,
  text: `
  bg-transparent text-base-content 
  focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent
  `,
  outline: `
  text-base-content border-base-content/60 
  hover:bg-base-200 border px-8 
  focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent
  disabled:hover:bg-transparent 
  `,
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
}

const classes = computed(() =>
  cn(
    "flex items-center justify-center items-center rounded-md border-2 border-transparent transition-colors duration-200 outline-none disabled:cursor-default",
    variantClasses[props.variant || "primary"],
    sizeClasses[props.size || "md"],
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
