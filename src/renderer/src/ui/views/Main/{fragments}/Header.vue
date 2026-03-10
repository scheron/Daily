<script setup lang="ts">
import {computed, ref, watch} from "vue"

import {toFullDate} from "@shared/utils/date/formatters"
import {useBranchesStore} from "@/stores/branches.store"
import {useUIStore} from "@/stores/ui.store"
import {useDevice} from "@/composables/useDevice"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKey"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseMenu, {BaseMenuItem} from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import AccentDotBadge from "@/ui/common/misc/AccentDotBadge.vue"

import {API} from "@/api"

import type {Branch} from "@shared/types/storage"

const props = defineProps<{taskEditorOpen: boolean; activeDay: string}>()
const emit = defineEmits<{createTask: []; toggleSidebar: []}>()

const {isDesktop} = useDevice()

const uiStore = useUIStore()
const branchesStore = useBranchesStore()

const formattedDate = computed(() => toFullDate(props.activeDay ?? new Date()))
const showToggleButton = computed(() => {
  if (isDesktop.value) return uiStore.isSidebarCollapsed
  return true
})

const activeBranchName = computed(() => branchesStore.activeBranch?.name || "Main")
const branchesWithActiveTasks = ref<Set<Branch["id"]>>(new Set())
const hasActiveTasksInOtherBranches = computed(() => branchesWithActiveTasks.value.size > 0)
let branchesLoadRequestId = 0

const menuItems = computed<BaseMenuItem[]>(() => {
  return branchesStore.orderedBranches.map((branch) => ({
    value: branch.id,
    label: branch.name,
    icon: "project",
    disabled: branchesStore.activeBranchId === branch.id,
  }))
})

async function onSelectBranch(id: Branch["id"], hide: () => void) {
  if (id === branchesStore.activeBranchId) return
  await branchesStore.setActiveBranch(id)
  hide()
}

function hasActiveTasks(branchId?: string | null): boolean {
  if (!branchId) return false
  return branchesWithActiveTasks.value.has(branchId)
}

async function loadBranchesWithActiveTasks() {
  const date = props.activeDay
  if (!date) {
    branchesWithActiveTasks.value = new Set()
    return
  }

  const requestId = ++branchesLoadRequestId

  try {
    const currentBranchId = branchesStore.activeBranchId
    const otherBranches = branchesStore.orderedBranches.filter((branch) => branch.id !== currentBranchId)

    const checks = await Promise.all(
      otherBranches.map(async (branch) => {
        try {
          const days = await API.getDays({from: date, to: date, branchId: branch.id})
          const hasActiveTasks = days.some((day) => day.date === date && day.countActive > 0)
          return hasActiveTasks ? branch.id : null
        } catch (error) {
          console.error(`Failed to load active tasks for project ${branch.id}`, error)
          return null
        }
      }),
    )
    if (requestId !== branchesLoadRequestId) return

    branchesWithActiveTasks.value = new Set(checks.filter(Boolean) as Branch["id"][])
  } catch (error) {
    if (requestId !== branchesLoadRequestId) return
    console.error("Failed to load cross-project active tasks", error)
    branchesWithActiveTasks.value = new Set()
  }
}

function onBranchPickerClick(toggle: () => void) {
  void loadBranchesWithActiveTasks()
  toggle()
}

watch(
  () => [props.activeDay, branchesStore.activeBranchId],
  () => void loadBranchesWithActiveTasks(),
  {immediate: true},
)
</script>

<template>
  <div class="app-header border-base-300 h-header flex items-center justify-between border-b px-4 py-2" style="-webkit-app-region: drag">
    <div class="flex min-w-0 items-center gap-2">
      <BaseButton
        v-if="showToggleButton"
        variant="ghost"
        icon="sidebar"
        :tooltip="isDesktop ? `Expand (${toShortcutKeys('ui:toggle-sidebar')})` : 'Menu'"
        style="-webkit-app-region: no-drag"
        class="ml-16"
        @click="emit('toggleSidebar')"
      />
      <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
        {{ formattedDate }}
      </h1>
    </div>

    <div class="flex items-center gap-2">
      <template v-if="!taskEditorOpen">
        <BasePopup hide-header position="end" container-class="p-0" content-class="gap-2">
          <template #trigger="{toggle}">
            <div class="relative">
              <BaseButton
                icon="project"
                variant="ghost"
                class="h-6 min-w-20 text-sm"
                icon-class="size-4"
                style="-webkit-app-region: no-drag"
                @click="onBranchPickerClick(toggle)"
              >
                {{ activeBranchName }}
              </BaseButton>
              <AccentDotBadge v-if="hasActiveTasksInOtherBranches" size="md" class="ring-base-100 absolute -top-0.5 -right-0.5 ring-2" />
            </div>
          </template>

          <template #default="{hide}">
            <BaseMenu :items="menuItems" @select="onSelectBranch($event as string, hide)">
              <template #item="{item}">
                <BaseIcon v-if="item.icon" :name="item.icon" :class="['size-4.5', item.classIcon]" />
                <span class="flex-1 truncate text-sm" :class="item.classLabel">{{ item.label }}</span>
                <AccentDotBadge v-if="hasActiveTasks(item.value)" />
              </template>
            </BaseMenu>
          </template>
        </BasePopup>

        <BaseButton
          variant="text"
          class="text-accent hover:bg-accent/10 focus-visible-ring focus-visible:ring-accent size-8 shrink-0 p-0"
          icon="plus"
          :tooltip="`Create (${toShortcutKeys('tasks:create')})`"
          style="-webkit-app-region: no-drag"
          @click="emit('createTask')"
        />
      </template>
    </div>
  </div>
</template>
