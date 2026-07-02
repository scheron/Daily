<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {useBranchesStore} from "@/stores/branches.store"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon"

import type {Branch} from "@shared/types/storage"

defineProps<{selectedId: Branch["id"] | null}>()
const emit = defineEmits<{select: [branch: Branch]; close: []}>()

const branchesStore = useBranchesStore()

const query = ref("")

function onSelect(branch: Branch) {
  emit("select", branch)
}

async function onCreate() {
  const name = query.value.trim()
  if (!name) return

  const created = await branchesStore.createBranch(name)
  if (!created) {
    toasts.error("Failed to create project")
    return
  }

  emit("select", created)
}
</script>

<template>
  <div class="w-64">
    <BaseCombobox
      :items="branchesStore.orderedBranches"
      :item-key="(branch) => branch.id"
      :filter-by="(branch) => branch.name"
      single
      placeholder="Search or create project..."
      empty-text="No projects found"
      @update:query="query = $event"
      @select="onSelect"
      @select-footer="onCreate"
      @close="emit('close')"
      @escape="emit('close')"
    >
      <template #item="{item}">
        <BaseIcon v-if="selectedId === item.id" name="check" class="text-accent size-4 shrink-0" />
        <span v-else class="size-4 shrink-0" />
        <BaseIcon name="project" class="size-4.5 shrink-0" :class="{'text-accent': selectedId === item.id}" />
        <span class="flex-1 truncate" :class="{'text-accent font-medium': selectedId === item.id}">{{ item.name }}</span>
      </template>

      <template #footer="{query: createName}">
        <BaseIcon name="plus" class="text-base-content/60 size-4 shrink-0" />
        <span class="truncate"
          >Create <span class="font-medium">"{{ createName }}"</span></span
        >
      </template>
    </BaseCombobox>
  </div>
</template>
