<script setup lang="ts">
import {computed} from "vue"
import {useNow} from "@vueuse/core"
import {DateTime} from "luxon"

import {ISODate} from "@shared/types/common"
import {toDateLabel, toISODate} from "@shared/utils/date/formatters"
import {useBranchesStore} from "@/stores/branches.store"
import {useTasksStore} from "@/stores/tasks"
import {useUIStore} from "@/stores/ui"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKey"
import BaseButton from "@/ui/base/BaseButton"
import BranchPicker from "@/ui/common/pickers/BranchPicker.vue"
import DayPicker from "@/ui/common/pickers/DayPicker.vue"
import {useSearchModal} from "@/ui/overlays/SearchModal"

import TagsFilter from "./{fragments}/TagsFilter.vue"

import type {Branch} from "@shared/types/storage"

const emit = defineEmits<{createTask: []}>()

const uiStore = useUIStore()
const tasksStore = useTasksStore()
const branchesStore = useBranchesStore()
const searchModal = useSearchModal()

const today = computed(() => toISODate(now.value))
const label = computed(() => {
  const text = toDateLabel(tasksStore.activeDay, {year: false})
  return tasksStore.activeDay === today.value ? `Today, ${text}` : text
})
const activeBranchName = computed(() => branchesStore.activeBranch?.name || "Main")

const now = useNow()

function step(delta: number) {
  const next = DateTime.fromISO(tasksStore.activeDay).plus({days: delta}).toISODate() as ISODate
  tasksStore.setActiveDay(next)
}

function onOpenAssistantPanel() {
  window.BridgeIPC.send("assistant:open")
}

async function onSelectBranch(branch: Branch) {
  if (branch.id === branchesStore.activeBranchId) return
  await branchesStore.setActiveBranch(branch.id)
}
</script>

<template>
  <div
    class="bg-base-100 border-base-300 h-header relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b px-4"
    style="-webkit-app-region: drag"
  >
    <div class="pl-traffic-light flex h-full min-w-0 items-center gap-2">
      <BaseButton
        variant="ghost-primary"
        icon="sidebar"
        class="size-8 shrink-0"
        icon-class="size-5"
        style="-webkit-app-region: no-drag"
        :tooltip="uiStore.leftPanelVisible ? 'Hide panel' : 'Show panel'"
        @click="uiStore.toggleLeftPanel()"
      />
      <TagsFilter class="min-w-0 flex-1" />
    </div>

    <div class="justify-self-center" style="-webkit-app-region: no-drag">
      <div class="flex items-center gap-1">
        <BaseButton variant="ghost" size="sm" icon="chevron-left" class="size-7" icon-class="size-4" tooltip="Previous day" @click="step(-1)" />

        <DayPicker
          hover-mode
          hide-on-select
          position="center"
          :days="tasksStore.days"
          :active-day="tasksStore.activeDay"
          :selected-day="tasksStore.activeDay"
          @select="tasksStore.setActiveDay"
        >
          <template #trigger="{show}">
            <BaseButton
              variant="primary-ghost-outline"
              size="sm"
              class="h-7 min-w-32 font-semibold"
              icon-class="size-4"
              tooltip="Previous day"
              @mouseenter="show"
            >
              {{ label }}
            </BaseButton>
          </template>
        </DayPicker>

        <BaseButton variant="ghost" size="sm" icon="chevron-right" class="size-7" icon-class="size-4" tooltip="Next day" @click="step(1)" />
      </div>
    </div>

    <div class="flex h-full min-w-0 justify-end">
      <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
        <BranchPicker :selected-id="branchesStore.activeBranchId" position="end" @select="onSelectBranch">
          <template #trigger="{toggle}">
            <BaseButton
              icon="project"
              variant="ghost-primary"
              class="h-7 min-w-20"
              icon-class="size-4"
              style="-webkit-app-region: no-drag"
              @click="toggle"
            >
              {{ activeBranchName }}
            </BaseButton>
          </template>
        </BranchPicker>
        <div class="flex items-center gap-2" style="-webkit-app-region: no-drag">
          <BaseButton
            icon="ai"
            variant="ghost-primary"
            class="size-8"
            icon-class="size-5"
            :tooltip="`AI Assistant (${toShortcutKeys('ui:open-assistant-panel')})`"
            @click="onOpenAssistantPanel"
          />

          <BaseButton
            variant="ghost-primary"
            icon="search"
            class="size-8"
            icon-class="size-5"
            :tooltip="`Search (${toShortcutKeys('ui:open-search-panel')})`"
            @click="searchModal.toggle()"
          />
        </div>

        <BaseButton
          variant="primary-ghost"
          icon="plus"
          icon-class="size-4"
          class="h-8 min-w-20 shrink-0"
          :tooltip="`New task (${toShortcutKeys('tasks:create')})`"
          @click="emit('createTask')"
        >
          New
        </BaseButton>
      </div>
    </div>
  </div>
</template>
