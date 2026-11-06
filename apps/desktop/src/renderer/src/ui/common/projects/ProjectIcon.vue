<script setup lang="ts">
import {computed} from "vue"

import {NO_PROJECT_ID, normalizeProjectEmoji} from "@daily/protocol"

import BaseIcon from "@/ui/base/BaseIcon"
import {getProjectIcon} from "@/utils/projects/getProjectIcon"

import type {Branch} from "@daily/protocol"

const props = defineProps<{project?: Pick<Branch, "id" | "emoji"> | null}>()

const emoji = computed(() => (props.project?.id !== NO_PROJECT_ID ? normalizeProjectEmoji(props.project?.emoji) : null))
</script>

<template>
  <span v-if="emoji" class="inline-flex shrink-0 items-center justify-center leading-none" aria-hidden="true">{{ emoji }}</span>
  <BaseIcon v-else :name="getProjectIcon(project)" aria-hidden="true" />
</template>
