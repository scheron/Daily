<script setup lang="ts">
import {defineAsyncComponent} from "vue"

import {useUIStore} from "@/stores/ui"
import {useAnimation} from "@/composables/useAnimation"
import {WIDGET_DEFS} from "@/constants/widgets"
import {cn} from "@/utils/ui/tailwindcss"
import PanelDragIndicator from "@/ui/common/indicators/PanelDragIndicator.vue"

import type {WidgetId, WidgetSlot} from "@/types/widgets"
import type {StyleValue} from "vue"

defineProps<{width: number}>()

const Widgets = {
  "calendar-month": defineAsyncComponent(() => import("./{fragments}/CalendarMonthWidget")),
  stats: defineAsyncComponent(() => import("./{fragments}/StatsWidget")),
  activity: defineAsyncComponent(() => import("./{fragments}/ActivityWidget")),
} satisfies Record<WidgetId, ReturnType<typeof defineAsyncComponent>>

const uiStore = useUIStore()

const {onEnter, onLeave} = useAnimation("slide")

function isLastWidget(index: number): boolean {
  return index === uiStore.slots.length - 1
}

function getWidgetClass(index: number, slot: WidgetSlot) {
  const base = "flex min-h-0 flex-col"

  if (isLastWidget(index)) return cn(base, "h-full flex-1 overflow-hidden")
  if (!WIDGET_DEFS[slot.id].resizable) return cn(base, "shrink-0")
  return cn(base, "h-full shrink-0 overflow-hidden")
}

function getWidgetStyle(index: number, slot: WidgetSlot): StyleValue {
  const def = WIDGET_DEFS[slot.id]
  if (isLastWidget(index)) return {minHeight: def.minHeight + "px"}
  if (!def.resizable) return {}
  return {
    height: slot.height + "px",
    minHeight: def.minHeight + "px",
    maxHeight: def.maxHeight + "px",
  }
}

function getWidgetBodyClass(slot: WidgetSlot) {
  return WIDGET_DEFS[slot.id].resizable ? "min-h-0 flex-1 overflow-hidden" : "shrink-0"
}
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <aside v-if="uiStore.leftPanelVisible" data-day-drop-zone class="bg-base-100 relative h-full shrink-0" :style="{width: width + 'px'}">
      <div class="flex h-full min-h-0 w-full flex-col overflow-y-auto" :style="{width: width + 'px'}">
        <template v-for="(slot, index) in uiStore.slots" :key="index">
          <div :class="getWidgetClass(index, slot)" :style="getWidgetStyle(index, slot)">
            <div :class="getWidgetBodyClass(slot)">
              <component :is="Widgets[slot.id]" />
            </div>
          </div>

          <template v-if="index < uiStore.slots.length - 1">
            <PanelDragIndicator v-if="WIDGET_DEFS[slot.id].resizable" :boundary="index" />
            <div v-else class="bg-base-300 h-px shrink-0" />
          </template>
        </template>
      </div>
    </aside>
  </Transition>
</template>
