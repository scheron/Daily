<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import type {HtmlHTMLAttributes} from "vue"

const props = withDefaults(
  defineProps<{
    keys: string[]
    class?: HtmlHTMLAttributes["class"]
  }>(),
  {
    keys: () => [],
    class: "",
  },
)

const classes = computed(() => cn("inline-flex items-center gap-1", props.class))
</script>

<template>
  <div :class="classes">
    <kbd
      v-for="key in keys"
      :key="key"
      class="bg-base-100 border-base-300 text-base-content/80 inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[11px] font-medium"
    >
      {{ key }}
    </kbd>
  </div>
</template>
