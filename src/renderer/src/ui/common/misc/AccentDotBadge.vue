<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import type {HtmlHTMLAttributes} from "vue"

const props = withDefaults(
  defineProps<{
    size?: "sm" | "md"
    class?: HtmlHTMLAttributes["class"]
  }>(),
  {
    size: "sm",
    class: "",
  },
)

const sizeClass = computed(() => (props.size === "md" ? "size-2.5" : "size-2"))
</script>

<template>
  <span aria-hidden="true" :class="cn('bg-accent pointer-events-none inline-block shrink-0 rounded-full', sizeClass, props.class)" />
</template>
