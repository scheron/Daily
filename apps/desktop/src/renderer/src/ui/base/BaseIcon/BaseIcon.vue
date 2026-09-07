<script lang="ts" setup>
import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "./IconsSprite.vue"

defineProps<{name: IconName}>()
</script>

<template>
  <svg :class="cn('inline-block aspect-square size-5 shrink-0 outline-none', $attrs.class as string)" tabindex="-1" fill="currentColor">
    <use :href="`#${name}`" />
  </svg>
</template>
