<script setup lang="ts">
import {computed} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import BranchPicker from "@/ui/common/pickers/BranchPicker.vue"
import {useSearchModal} from "@/ui/overlays/SearchModal"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKeys"
import ConnectionIndicator from "./{fragments}/ConnectionIndicator.vue"

import type {Branch} from "@daily/protocol"

const emit = defineEmits<{createTask: []}>()

const branchesStore = useBranchesStore()
const uiStore = useUIStore()

const activeBranchName = computed(() => branchesStore.activeBranch?.name || "Main")

const searchModal = useSearchModal()

function onOpenAssistantPanel() {
  window.BridgeIPC.send("assistant:open")
}

async function onSelectBranch(branch: Branch) {
  if (branch.id === branchesStore.activeBranchId) return
  await branchesStore.setActiveBranch(branch.id)
}
</script>

<template>
  <BaseAnimation name="fade" :duration="200">
    <div
      v-if="!uiStore.isCalendarDockExpanded"
      class="dock-surface absolute top-2 right-3.5 z-20 flex h-8.5 items-center gap-0.5 rounded-full px-1 [-webkit-app-region:no-drag]"
    >
      <ConnectionIndicator />

      <BranchPicker
        :selected-id="branchesStore.activeBranchId"
        side="bottom"
        position="start"
        trigger-class="h-full flex items-center"
        hover-mode
        @select="onSelectBranch"
      >
        <template #trigger="{show}">
          <BaseButton icon="project" variant="ghost-primary" size="sm" class="min-w-20" @mouseenter="show" @click="show">
            <span class="max-w-24 truncate">{{ activeBranchName }}</span>
          </BaseButton>
        </template>
      </BranchPicker>

      <div class="bg-base-300 mx-0.5 h-4.5 w-px" />

      <BaseButton
        icon="ai"
        variant="ghost-primary"
        size="sm"
        :tooltip="`AI Assistant (${toShortcutKeys('ui:open-assistant-panel')})`"
        @click="onOpenAssistantPanel"
      />

      <BaseButton
        variant="ghost-primary"
        icon="search"
        size="sm"
        :tooltip="`Search (${toShortcutKeys('ui:open-search-panel')})`"
        @click="searchModal.toggle()"
      />

      <div class="bg-base-300 mx-0.5 h-4.5 w-px" />

      <BaseButton
        variant="primary-ghost"
        icon="plus"
        size="sm"
        class="min-w-20"
        :tooltip="`New task (${toShortcutKeys('tasks:create')})`"
        @click="emit('createTask')"
      >
        New
      </BaseButton>
    </div>
  </BaseAnimation>
</template>
