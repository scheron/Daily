<script setup lang="ts">
import {nextTick, useTemplateRef, watch} from "vue"

import ProjectIcon from "@/ui/common/projects/ProjectIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {QuickTaskMenu} from "@shared/types/quickTask"

const props = defineProps<{menu: QuickTaskMenu}>()
const emit = defineEmits<{pick: [index: number]}>()

const listRef = useTemplateRef<HTMLUListElement>("list")

function getRowClasses(isRemoving: boolean) {
  return cn("slash-command-row", isRemoving && "slash-tag-remove")
}

watch(
  () => props.menu.selected,
  async (selected) => {
    await nextTick()
    listRef.value?.children[selected]?.scrollIntoView?.({block: "nearest"})
  },
  {immediate: true},
)
</script>

<template>
  <div class="slash-command-menu">
    <ul ref="list" class="slash-command-rows" role="listbox" aria-label="Slash commands" @mousedown.prevent>
      <li
        v-for="(row, index) in menu.rows"
        :key="index"
        v-tooltip="row.tooltip"
        role="option"
        :class="getRowClasses(row.tone === 'remove')"
        :aria-selected="index === menu.selected ? 'true' : undefined"
        @click="emit('pick', index)"
      >
        <span v-if="row.color" class="slash-tag-chip" :style="{'--tag-color': row.color}">
          {{ row.label }}
        </span>
        <span v-else class="slash-command-option">
          <span class="slash-command-icon" :style="{color: row.iconColor}">
            <ProjectIcon v-if="row.project" :project="row.project" class="size-4" />
            <svg v-else-if="row.icon" width="16" height="16" aria-hidden="true"><use :href="`#${row.icon}`" /></svg>
          </span>
          <span>{{ row.label }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style src="./slashCommandMenu.css"></style>
