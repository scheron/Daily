<script setup lang="ts">
import {computed, ref} from "vue"
import VueDraggable from "vuedraggable"

import {useUIStore} from "@/stores/ui"
import {WIDGET_DEFS} from "@/constants/widgets"
import BaseButton from "@/ui/base/BaseButton"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import WidgetPicker from "@/ui/common/pickers/WidgetPicker.vue"

import type {WidgetId, WidgetSlot} from "@/types/widgets"

const uiStore = useUIStore()

const addPopupRef = ref<InstanceType<typeof BasePopup> | null>(null)

const addMenuItems = computed(() =>
  Object.values(WIDGET_DEFS).map((widget) => ({
    value: widget.id,
    label: widget.name,
    icon: widget.icon,
  })),
)

function slotKey(slot: WidgetSlot) {
  return uiStore.slots.indexOf(slot)
}

function onAddWidget(widgetId: string | null | undefined) {
  if (!widgetId) return
  const def = WIDGET_DEFS[widgetId as WidgetId]
  if (!def) return
  uiStore.addSlot(def.id, def.minHeight)
  addPopupRef.value?.hide()
}
</script>

<template>
  <div class="border-base-300 flex flex-col overflow-hidden rounded-lg border">
    <VueDraggable
      :list="uiStore.slots"
      :item-key="slotKey"
      handle="[data-drag-handle]"
      ghost-class="opacity-10"
      :animation="150"
      tag="div"
      class="divide-base-300/70 flex flex-col divide-y"
    >
      <template #item="{element: slot, index}">
        <div class="group flex items-center gap-1.5 px-2 py-1.5">
          <BaseButton
            data-drag-handle
            variant="text"
            type="button"
            class="size-6 shrink-0 cursor-grab active:cursor-grabbing"
            icon="drag-vertical"
            icon-class="size-4"
          />

          <WidgetPicker :model-value="slot.id" class="flex-1" @update:model-value="uiStore.setSlotWidget(index, $event)" />

          <BaseButton
            variant="ghost"
            icon="x-mark"
            icon-class="size-3.5"
            class="text-base-content/60 hover:text-error hover:bg-error/10 size-6 shrink-0 p-0"
            tooltip="Remove"
            @click="uiStore.removeSlot(index)"
          />
        </div>
      </template>
    </VueDraggable>

    <div v-if="uiStore.slots.length === 0" class="text-base-content/40 px-3 py-4 text-center text-xs">No widgets. Add one below.</div>

    <BasePopup ref="addPopupRef" hide-header position="start" trigger-class="border-base-300/70 border-t">
      <template #trigger="{toggle}">
        <BaseButton variant="ghost" size="sm" icon="plus" class="h-8 w-full justify-center rounded-none px-3 text-sm" @click="toggle">
          Add widget
        </BaseButton>
      </template>

      <BaseMenu :items="addMenuItems" @select="onAddWidget" />
    </BasePopup>
  </div>
</template>
