<script setup lang="ts">
import {computed} from "vue"

import {toFullDate} from "@shared/utils/date/formatters"
import {useBranchesStore} from "@/stores/branches.store"
import {useUIStore} from "@/stores/ui.store"
import {useUpdateStore} from "@/stores/update.store"
import {useDevice} from "@/composables/useDevice"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKey"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseMenu, {BaseMenuItem} from "@/ui/base/BaseMenu.vue"
import BasePopup from "@/ui/base/BasePopup.vue"

import type {Branch} from "@shared/types/storage"

const props = defineProps<{taskEditorOpen: boolean; activeDay: string}>()
const emit = defineEmits<{createTask: []; toggleSidebar: []}>()

const {isDesktop} = useDevice()

const uiStore = useUIStore()
const branchesStore = useBranchesStore()
const updateStore = useUpdateStore()

const formattedDate = computed(() => toFullDate(props.activeDay ?? new Date()))
const showToggleButton = computed(() => {
  if (isDesktop.value) return uiStore.isSidebarCollapsed
  return true
})

const activeBranchName = computed(() => branchesStore.activeBranch?.name || "Main")

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

async function onInstallUpdate() {
  await updateStore.installUpdate()
}
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
      <BaseButton
        v-if="updateStore.isReadyToInstall || updateStore.isInstalling"
        variant="secondary"
        icon="refresh"
        size="sm"
        class="text-accent border-accent/20 bg-accent/10 hover:bg-accent/20 min-w-24"
        style="-webkit-app-region: no-drag"
        :loading="updateStore.isInstalling"
        :disabled="updateStore.isInstalling"
        tooltip="Install downloaded update"
        @click="onInstallUpdate"
      >
        Update
      </BaseButton>

      <template v-if="!taskEditorOpen">
        <BasePopup hide-header position="end" container-class="p-0" content-class="gap-2">
          <template #trigger="{toggle}">
            <BaseButton
              icon="project"
              variant="ghost"
              class="h-6 min-w-20 text-sm"
              icon-class="size-4"
              style="-webkit-app-region: no-drag"
              @click="toggle"
            >
              {{ activeBranchName }}
            </BaseButton>
          </template>

          <template #default="{hide}">
            <BaseMenu :items="menuItems" @select="onSelectBranch($event as string, hide)" />
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
