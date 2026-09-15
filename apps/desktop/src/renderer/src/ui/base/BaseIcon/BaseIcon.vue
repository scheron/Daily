<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "./IconsSprite.vue"

defineProps<{name: IconName}>()

function getIconClasses(attrsClass: string) {
  return cn("inline-block aspect-square size-5 shrink-0 outline-none", attrsClass)
}
</script>

<template>
  <svg :class="getIconClasses($attrs.class as string)" tabindex="-1" fill="currentColor">
    <use :href="`#${name}`" />
  </svg>
</template>
