<script setup lang="ts">
import {computed, useTemplateRef} from "vue"

import {useMilestonesStore} from "@/stores/milestones.store"
import BaseMenu from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {BaseMenuItem} from "@/ui/base/BaseMenu.vue"
import type {HorizontalPosition} from "@/ui/base/BasePopup.vue"
import type {Milestone} from "@daily/protocol"

const NO_MILESTONE_VALUE = "__none__"

const props = withDefaults(defineProps<{selectedId: Milestone["id"] | null; position?: HorizontalPosition}>(), {position: "start"})

const emit = defineEmits<{select: [id: Milestone["id"] | null]}>()

const milestonesStore = useMilestonesStore()

const popupRef = useTemplateRef<InstanceType<typeof BasePopup>>("popup")

const items = computed<BaseMenuItem[]>(() => [
  {
    value: NO_MILESTONE_VALUE,
    label: "No milestone",
    icon: "minus",
    ...(props.selectedId === null ? {classIcon: "text-accent", classLabel: "text-accent"} : {}),
  },
  ...milestonesStore.milestones.map((milestone) => ({
    value: milestone.id,
    label: milestone.name,
    icon: "bookmark" as const,
    ...(milestone.id === props.selectedId ? {classIcon: "text-accent", classLabel: "text-accent"} : {}),
  })),
])

function onSelect(value: BaseMenuItem["value"] | null) {
  popupRef.value?.hide()
  if (!value) return
  emit("select", value === NO_MILESTONE_VALUE ? null : value)
}
</script>

<template>
  <BasePopup ref="popup" hide-header :position="position" trigger-class="min-w-0">
    <template #trigger="{toggle}">
      <slot name="trigger" :toggle="toggle" />
    </template>

    <BaseMenu :items="items" @select="onSelect" />
  </BasePopup>
</template>
