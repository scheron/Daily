<script setup lang="ts">
import {cn} from "@/utils/ui/tailwindcss"

import type {HTMLAttributes} from "vue"

interface SkeletonProps {
  class?: HTMLAttributes["class"]
}

const props = defineProps<SkeletonProps>()
</script>

<template>
  <div :class="cn('bg-base-300 animate-pulse rounded-md', props.class)" />
</template>
