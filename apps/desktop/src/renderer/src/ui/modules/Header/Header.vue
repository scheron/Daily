<script setup lang="ts">
import {computed} from "vue"

import {useBranchesStore} from "@/stores/branches.store"
import BaseButton from "@/ui/base/BaseButton"
import BranchPicker from "@/ui/common/pickers/BranchPicker.vue"
import {useSearchModal} from "@/ui/overlays/SearchModal"
import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKey"
import TagsFilter from "./{fragments}/TagsFilter.vue"

import type {Branch} from "@daily/protocol"

const emit = defineEmits<{createTask: []}>()

const branchesStore = useBranchesStore()
const searchModal = useSearchModal()

const activeBranchName = computed(() => branchesStore.activeBranch?.name || "Main")

function onOpenAssistantPanel() {
  window.BridgeIPC.send("assistant:open")
}

async function onSelectBranch(branch: Branch) {
  if (branch.id === branchesStore.activeBranchId) return
  await branchesStore.setActiveBranch(branch.id)
}
</script>

<template>
  <div class="bg-base-100 border-base-300 h-header relative flex items-center border-b px-4" style="-webkit-app-region: drag">
    <div class="pl-traffic-light flex h-full min-w-0 flex-1 items-center gap-2">
      <TagsFilter class="min-w-0 flex-1" />
    </div>

    <div class="flex h-full shrink-0 justify-end">
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
