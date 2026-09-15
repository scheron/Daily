<script setup lang="ts">
import {nextTick, ref, useTemplateRef} from "vue"
import {toasts} from "vue-toasts-lite"

import {MAIN_BRANCH_ID} from "@daily/protocol"

import {useBranchesStore} from "@/stores/branches.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {cn} from "@/utils/ui/tailwindcss"

import type {Branch} from "@daily/protocol"

const props = defineProps<{selectedId: Branch["id"]}>()
const emit = defineEmits<{select: [id: Branch["id"]]}>()

const branchesStore = useBranchesStore()

const createInputRef = useTemplateRef<{focus: () => void}>("createInput")

const isCreating = ref(false)
const newProjectName = ref("")
const editingId = ref<Branch["id"] | null>(null)
const editingName = ref("")

function isSelected(branch: Branch): boolean {
  return props.selectedId === branch.id
}

function isActive(branch: Branch): boolean {
  return branchesStore.activeBranchId === branch.id
}

function startCreate() {
  isCreating.value = true
  newProjectName.value = ""
  nextTick(() => createInputRef.value?.focus())
}

function cancelCreate() {
  isCreating.value = false
  newProjectName.value = ""
}

function startEdit(branch: Branch) {
  if (branch.id === MAIN_BRANCH_ID) return
  editingId.value = branch.id
  editingName.value = branch.name
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ""
}

async function createProject() {
  const name = newProjectName.value.trim()
  if (!name) return

  const created = await branchesStore.createBranch(name)
  if (!created) {
    toasts.error("Failed to create project")
    return
  }

  cancelCreate()
  toasts.success("Project created")
}

async function renameProject(id: Branch["id"]) {
  const name = editingName.value.trim()
  if (!name) return
  if (id === MAIN_BRANCH_ID) {
    toasts.error("Main project cannot be renamed")
    return
  }

  const updated = await branchesStore.updateBranchName(id, name)
  if (!updated) {
    toasts.error("Failed to rename project")
    return
  }

  cancelEdit()
  toasts.success("Project renamed")
}

async function deleteProject(branch: Branch) {
  if (branch.id === MAIN_BRANCH_ID) {
    toasts.error("Main project cannot be deleted")
    return
  }

  const deleted = await branchesStore.deleteBranch(branch.id)
  if (!deleted) {
    toasts.error("Failed to delete project")
    return
  }

  toasts.success("Project deleted")
}

function getProjectIconClasses(isBranchActive: boolean, isBranchSelected: boolean) {
  return cn("size-4 shrink-0", isBranchActive && !isBranchSelected && "text-accent")
}

function getProjectButtonClasses(isBranchSelected: boolean) {
  return cn(
    "flex max-w-56 gap-2 px-4 py-0.5 text-sm",
    isBranchSelected ? "bg-accent/15 hover:bg-accent/20 text-accent" : "text-base-content/70 hover:bg-base-200 hover:text-base-content",
  )
}

function getProjectNameClasses(isBranchActive: boolean) {
  return cn("truncate", isBranchActive && "font-medium")
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <BaseButton
      v-if="!isCreating"
      variant="dashed"
      icon="plus"
      icon-class="size-4 shrink-0"
      class="flex shrink-0 gap-2 px-2 py-0.5 text-sm whitespace-nowrap"
      @click="startCreate"
    >
      New project
    </BaseButton>

    <div v-else class="border-accent flex w-45 shrink-0 items-center gap-2 rounded-full border-2 border-dashed px-4 py-0.5 text-sm">
      <BaseIcon name="project" class="text-base-content/50 size-4 shrink-0" />

      <BaseInput
        ref="createInput"
        v-model="newProjectName"
        bare
        hide-outline
        placeholder="New project"
        class="min-w-0 flex-1 text-sm"
        @keyup.enter="createProject"
        @keyup.escape="cancelCreate"
      />

      <BaseButton variant="ghost" :disabled="!newProjectName.trim()" class="size-5 shrink-0 p-0 text-[11px]" @click="createProject">↵</BaseButton>
    </div>

    <template v-for="branch in branchesStore.orderedBranches" :key="branch.id">
      <div v-if="editingId === branch.id" class="border-accent flex w-45 shrink-0 items-center gap-2 rounded-full border-2 px-4 py-0.5 text-sm">
        <BaseIcon name="project" class="text-base-content/50 size-4 shrink-0" />

        <BaseInput
          v-model="editingName"
          bare
          hide-outline
          focus-on-mount
          class="min-w-0 flex-1 text-sm"
          @keyup.enter="renameProject(branch.id)"
          @keyup.escape="cancelEdit"
        />

        <BaseButton icon="check" variant="ghost" icon-class="size-3.5" class="size-5 shrink-0 p-0" @click="renameProject(branch.id)" />
        <BaseButton icon="x-mark" variant="ghost" icon-class="size-3.5" class="size-5 shrink-0 p-0" @click="cancelEdit" />
      </div>

      <div v-else class="flex shrink-0 items-center gap-0.5">
        <BaseButton
          variant="ghost"
          icon="project"
          :icon-class="getProjectIconClasses(isActive(branch), isSelected(branch))"
          :class="getProjectButtonClasses(isSelected(branch))"
          @click="emit('select', branch.id)"
        >
          <span :class="getProjectNameClasses(isActive(branch))">{{ branch.name }}</span>
        </BaseButton>

        <template v-if="isSelected(branch) && branch.id !== MAIN_BRANCH_ID">
          <BaseButton icon="pencil" variant="ghost" icon-class="size-3.5" class="size-7 shrink-0 p-0" @click="startEdit(branch)" />

          <ConfirmPopup
            title="Delete project?"
            message="This project's tasks, milestones and tags will be deleted with it!"
            confirm-text="Delete"
            cancel-text="Cancel"
            position="end"
            content-class="max-w-72"
            @confirm="deleteProject(branch)"
          >
            <template #trigger="{show}">
              <BaseButton icon="trash" variant="ghost" icon-class="size-3.5" class="text-error hover:bg-error/10 size-7 shrink-0 p-0" @click="show" />
            </template>
          </ConfirmPopup>
        </template>
      </div>
    </template>
  </div>
</template>
