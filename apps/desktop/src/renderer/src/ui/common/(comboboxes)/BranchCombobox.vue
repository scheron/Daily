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
  /** Several selected projects; wins over `selectedId`. */
  selectedIds?: readonly Branch["id"][]
  /** Offers "All projects" as the first row. */
  hasAllProjects?: boolean
  /** Marks every row, All projects included. */
  isAllProjectsSelected?: boolean
  /** `Cmd`+click on a project keeps the menu open and emits `select` with `isMulti`. */
  isMultiSelect?: boolean
}>()
const emit = defineEmits<{select: [branch: Branch, options: {isMulti: boolean}]; "select-all": []; close: []}>()

const branchesStore = useBranchesStore()

const query = ref("")

const rows = computed<Row[]>(() => {
  const projects = branchesStore.orderedBranches.map((branch): Row => ({kind: "project", branch}))
  return props.hasAllProjects ? [{kind: "all"}, ...projects] : projects
})

function onSelect(row: Row, event?: MouseEvent) {
  if (row.kind === "project") {
    emit("select", row.branch, {isMulti: isMultiClick(row, event)})
    return
  }
  emit("select-all")
}

function isMultiClick(row: Row, event?: MouseEvent) {
  return Boolean(props.isMultiSelect && row.kind === "project" && event?.metaKey)
}

function getRowKey(row: Row) {
  return row.kind === "all" ? "all-projects" : row.branch.id
}

function getRowLabel(row: Row) {
  return row.kind === "all" ? "All projects" : getProjectName(row.branch)
}

function isRowSelected(row: Row) {
  if (props.isAllProjectsSelected) return true
  if (row.kind === "all") return false
  return (props.selectedIds ?? [props.selectedId]).includes(row.branch.id)
}

async function onCreate() {
  const name = query.value.trim()
  if (!name) return

  const created = await branchesStore.createBranch(name)
  if (!created) {
    toasts.error("Failed to create project")
    return
  }

  emit("select", created, {isMulti: false})
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
      :hold-open="isMultiClick"
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
