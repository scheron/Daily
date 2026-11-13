<script setup lang="ts">
import {computed, ref} from "vue"

import {toasts} from "@/composables/useToasts"
import {useBranchesStore} from "@/stores/branches"
import BaseCombobox from "@/ui/base/BaseCombobox"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import ProjectIcon from "@/ui/common/(icons)/ProjectIcon.vue"
import {getProjectName} from "@/utils/projects/getProjectName"

import type {Branch} from "@daily/protocol"

type Row = {kind: "all"} | {kind: "project"; branch: Branch}

const props = defineProps<{
  selectedId: Branch["id"] | null
  /** Offers "All projects" as the first row. */
  hasAllProjects?: boolean
  isAllProjectsSelected?: boolean
}>()
const emit = defineEmits<{select: [branch: Branch]; "select-all": []; close: []}>()

const branchesStore = useBranchesStore()

const query = ref("")

const rows = computed<Row[]>(() => {
  const projects = branchesStore.orderedBranches.map((branch): Row => ({kind: "project", branch}))
  return props.hasAllProjects ? [{kind: "all"}, ...projects] : projects
})

function onSelect(row: Row) {
  if (row.kind === "project") {
    emit("select", row.branch)
    return
  }
  emit("select-all")
}

function getRowKey(row: Row) {
  return row.kind === "all" ? "all-projects" : row.branch.id
}

function getRowLabel(row: Row) {
  return row.kind === "all" ? "All projects" : getProjectName(row.branch)
}

function isRowSelected(row: Row) {
  return row.kind === "all" ? Boolean(props.isAllProjectsSelected) : !props.isAllProjectsSelected && props.selectedId === row.branch.id
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
  emit("close")
}
</script>

<template>
  <div class="w-64">
    <BaseCombobox
      :items="rows"
      :item-key="getRowKey"
      :filter-by="getRowLabel"
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
        <BaseIcon v-if="item.kind === 'all'" name="layers" class="size-4.5 shrink-0" />
        <ProjectIcon v-else :project="item.branch" class="size-4.5 shrink-0" />
        <span class="flex-1 truncate">{{ getRowLabel(item) }}</span>
        <BaseIcon v-if="isRowSelected(item)" name="check" class="text-base-content/60 size-4 shrink-0" />
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
