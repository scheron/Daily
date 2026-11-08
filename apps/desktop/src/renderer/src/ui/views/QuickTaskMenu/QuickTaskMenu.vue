<script setup lang="ts">
import {nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef} from "vue"

import {useThemeStore} from "@/stores/theme"
import SlashCommandRows from "@/ui/common/(misc)/SlashCommandRows"

import type {QuickTaskMenu} from "@shared/types/quickTask"

useThemeStore()

const menu = ref<QuickTaskMenu | null>(null)

const panelRef = useTemplateRef<HTMLElement>("panel")

const stopListeningMenu = window.BridgeIPC["quick-task-menu:on-menu"](onMenu)

async function onMenu(next: QuickTaskMenu | null) {
  menu.value = next
  if (!next) return

  await nextTick()
  if (panelRef.value) window.BridgeIPC["quick-task-menu:resize"](Math.ceil(panelRef.value.getBoundingClientRect().height))
}

function onPick(index: number) {
  window.BridgeIPC["quick-task-menu:pick"](index)
}

onMounted(() => window.BridgeIPC.send("window:ready"))
onBeforeUnmount(() => stopListeningMenu())
</script>

<template>
  <div v-if="menu" ref="panel">
    <SlashCommandRows :menu="menu" class="quick-task-menu-rows select-none" @pick="onPick" />
  </div>
</template>

<style>
html,
body,
#app {
  background: transparent;
  overflow: hidden;
}

.quick-task-menu-rows {
  box-shadow: none;
}
</style>
