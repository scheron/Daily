<script lang="ts" setup>
import {cn} from "@/utils/tailwindcss"

import type {IconName} from "./IconsSprite.vue"

defineProps<{name: IconName}>()
</script>

<template>
  <svg :class="cn('inline-block aspect-square size-5 shrink-0', $attrs.class as string)" fill="currentColor">
    <use :href="`#${name}`" />
  </svg>
</template> 