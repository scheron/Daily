<script setup lang="ts">
import {computed} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import {useUIStore} from "@/stores/ui"
import BaseAnimation from "@/ui/base/BaseAnimation.vue"
import BaseButton from "@/ui/base/BaseButton"
import BranchPicker from "@/ui/common/pickers/BranchPicker.vue"
import {useSearchModal} from "@/ui/overlays/SearchModal"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKeys"

import type {Branch} from "@daily/protocol"

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
      class="dock-surface absolute bottom-3.5 left-3.5 z-20 flex h-10 items-center gap-0.5 rounded-full px-1"
    >
      <BranchPicker
        :selected-id="branchesStore.activeBranchId"
        side="top"
        position="start"
        trigger-class="h-full flex items-center"
        @select="onSelectBranch"
      >
        <template #trigger="{toggle}">
          <BaseButton icon="project" variant="ghost-primary" class="h-8 min-w-20 py-0" icon-class="size-4" @click="toggle">
            <span class="max-w-24 truncate">{{ activeBranchName }}</span>
          </BaseButton>
        </template>
      </BranchPicker>

      <div class="bg-base-300 mx-0.5 h-4.5 w-px" />

      <BaseButton
        icon="ai"
        variant="ghost-primary"
        class="size-8 py-0"
        icon-class="size-5"
        :tooltip="`AI Assistant (${toShortcutKeys('ui:open-assistant-panel')})`"
        @click="onOpenAssistantPanel"
      />

      <BaseButton
        variant="ghost-primary"
        icon="search"
        class="size-8 py-0"
        icon-class="size-5"
        :tooltip="`Search (${toShortcutKeys('ui:open-search-panel')})`"
        @click="searchModal.toggle()"
      />
    </div>
  </BaseAnimation>
</template>
