<script setup lang="ts">
import {computed} from "vue"

import {cn} from "@/utils/ui/tailwindcss"

import type {IconName} from "@/types/icons"
import type {HTMLAttributes} from "vue"

const props = defineProps<{name: IconName; class?: HTMLAttributes["class"]}>()

const iconClass = computed(() => cn("inline-block aspect-square size-5 shrink-0 outline-none", props.class))
</script>

<template>
  <svg :class="iconClass" tabindex="-1" fill="currentColor">
    <use :href="`#${name}`" />
  </svg>
</template>
