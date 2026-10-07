<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef} from "vue"
import {useStyleTag} from "@vueuse/core"

import {useThemeStore} from "@/stores/theme"
import {getCompletionChipClass, getCompletionRowClass} from "@/utils/codemirror/extensions/completionRow"
import {utilityStyles} from "@/utils/codemirror/theme"
import {styleSpecToCss} from "@/utils/codemirror/theme/styleSpecToCss"

import type {QuickTaskMenu} from "@shared/types/quickTask"

useThemeStore()
useStyleTag(styleSpecToCss(utilityStyles))

const menu = ref<QuickTaskMenu | null>(null)

const panelRef = useTemplateRef<HTMLElement>("panel")
const listRef = useTemplateRef<HTMLElement>("list")

const stopListeningMenu = window.BridgeIPC["quick-task-menu:on-menu"](onMenu)

async function onMenu(next: QuickTaskMenu | null) {
  menu.value = next
  if (!next) return

  await nextTick()
  listRef.value?.children[next.selected]?.scrollIntoView({block: "nearest"})
  if (panelRef.value) window.BridgeIPC["quick-task-menu:resize"](Math.ceil(panelRef.value.getBoundingClientRect().height))
}

function onPick(index: number) {
  window.BridgeIPC["quick-task-menu:pick"](index)
}

onMounted(() => window.BridgeIPC.send("window:ready"))
onBeforeUnmount(() => stopListeningMenu())
</script>

<template>
  <div v-if="menu" ref="panel" class="cm-tooltip cm-tooltip-autocomplete cm-tags-autocomplete select-none" @mousedown.prevent>
    <ul ref="list">
      <li
        v-for="(row, index) in menu.rows"
        :key="index"
        role="option"
        :class="getCompletionRowClass(row)"
        :aria-selected="index === menu.selected ? 'true' : undefined"
        @click="onPick(index)"
      >
        <span v-if="getCompletionChipClass(row)" :class="getCompletionChipClass(row)" :style="{'--tag-color': row.color}">
          {{ row.label }}
        </span>
        <span v-else class="cm-slash-option-row">
          <span class="cm-slash-option-icon" :style="{color: row.iconColor}">
            <svg v-if="row.icon" width="16" height="16" aria-hidden="true"><use :href="`#${row.icon}`" /></svg>
          </span>
          <span class="cm-slash-option-label">{{ row.label }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style>
html,
body,
#app {
  background: transparent;
  overflow: hidden;
}

.cm-tooltip.cm-tooltip-autocomplete {
  box-shadow: none;
}

.cm-tooltip.cm-tooltip-autocomplete > ul {
  margin: 0;
  white-space: nowrap;
  overflow-y: auto;
  list-style: none;
}

.cm-tooltip.cm-tooltip-autocomplete > ul > li {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}
</style>
