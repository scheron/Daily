<script setup lang="ts">
import BaseKeyCaps from "@/ui/base/BaseKeyCaps.vue"
import {toShortcutKeyCaps} from "@/utils/shortcuts/toShortcutKeys"
import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"

import type {ShortcutAction} from "@shared/types/shortcuts"

const columns: {title: string; actions: ShortcutAction[]}[][] = [
  [
    {title: "App", actions: ["tasks:create", "ui:open-search-panel", "ui:calendar-dock:toggle", "ui:open-assistant-panel", "ui:open-settings-panel"]},
    {title: "Task editor", actions: ["editor:save", "editor:save-close", "editor:close"]},
  ],
  [
    {title: "Text formatting", actions: ["markdown:bold", "markdown:italic", "markdown:code"]},
    {title: "Comments", actions: ["comments:submit", "comments:cancel"]},
  ],
]
</script>

<template>
  <div class="grid grid-cols-2 gap-x-10">
    <div v-for="(column, columnIndex) in columns" :key="columnIndex" class="flex flex-col gap-3.5">
      <div v-for="block in column" :key="block.title" class="flex flex-col">
        <h3 class="text-base-content/60 mb-0.5 text-xs font-medium">{{ block.title }}</h3>

        <div v-for="action in block.actions" :key="action" class="flex items-center justify-between gap-6 py-1.5">
          <span class="text-base-content text-sm">{{ SHORTCUTS_MAP[action].label }}</span>

          <BaseKeyCaps :keys="toShortcutKeyCaps(action)" />
        </div>
      </div>
    </div>
  </div>
</template>
