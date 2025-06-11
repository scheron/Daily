<script setup lang="ts">
import {computed} from "vue"

import type {IconName} from "./BaseIcon/IconsSprite.vue"
import type {HtmlHTMLAttributes} from "vue"

import BaseIcon from "./BaseIcon/BaseIcon.vue"
import {cn} from "@/utils/tailwindcss"

const props = defineProps<{
  variant?: "primary" | "ghost" | "text" | "outline"
  size?: "sm" | "md" | "lg"
  icon?: IconName
  disabled?: boolean
  iconClass?: HtmlHTMLAttributes["class"]
  class?: HtmlHTMLAttributes["class"]
}>()

const slots = defineSlots<{
  default?: () => any
}>()

const variantClasses = {
  primary:
    "bg-accent/20 text-accent hover:bg-accent/30 disabled:hover:bg-accent/20 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-accent",
  ghost:
    "bg-transparent hover:bg-base-200 disabled:hover:bg-transparent text-base-content focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-base-content",
  text: "bg-transparent text-base-content focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-base-content",
  outline:
    "text-base-content border-base-content/60 disabled:hover:bg-transparent hover:bg-base-200 border px-8 focus-visible-ring focus-visible:ring-offset-base-100 focus-visible:ring-base-content",
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
    slots.default ? "gap-1 px-3 py-1" : "p-1",
    props.class,
    props.disabled && "cursor-auto opacity-50",
  ),
)
</script>

<template>
  <button :class="classes" :disabled="disabled">
    <BaseIcon v-if="icon" :name="icon" :class="iconClass" />
    <slot />
  </button>
</template> 