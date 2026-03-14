<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {MAIN_BRANCH_ID} from "@shared/constants/storage"
import {useBranchesStore} from "@/stores/branches.store"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import ConfirmPopup from "@/ui/common/misc/ConfirmPopup.vue"

import type {Branch} from "@shared/types/storage"

const branchesStore = useBranchesStore()
const tasksStore = useTasksStore()

const newProjectName = ref("")
const editingId = ref<Branch["id"] | null>(null)
const editingName = ref("")

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

  newProjectName.value = ""
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

  await tasksStore.getTaskList()
  toasts.success("Project deleted")
}

async function setActiveProject(id: Branch["id"]) {
  if (id === branchesStore.activeBranchId) return
  await branchesStore.setActiveBranch(id)
  await tasksStore.getTaskList()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <BaseInput v-model="newProjectName" placeholder="New project name" class="h-8 text-xs" @keyup.enter="createProject" />
      <BaseButton icon="plus" variant="ghost" class="h-8 px-3 text-xs" :disabled="!newProjectName.trim()" @click="createProject">Add</BaseButton>
    </div>

    <div class="flex w-full flex-col gap-2">
      <div v-for="branch in branchesStore.orderedBranches" :key="branch.id" class="h-8 w-full">
        <div v-if="editingId === branch.id" class="grid w-full grid-cols-[1fr_auto_auto] gap-2">
          <BaseInput v-model="editingName" focus-on-mount class="h-8 text-xs" @keyup.enter="renameProject(branch.id)" />
          <BaseButton icon="check" variant="ghost" icon-class="size-4" class="size-7 p-0" @click="renameProject(branch.id)" />
          <BaseButton icon="x-mark" variant="ghost" icon-class="size-4" class="size-7 p-0" @click="cancelEdit" />
        </div>

        <div v-else class="grid w-full grid-cols-[1fr_auto_auto] gap-2">
          <span
            class="text-base-content/80 ml-2 flex flex-1 items-center gap-2 truncate text-left text-xs"
            :class="{'text-accent font-medium': branchesStore.activeBranchId === branch.id}"
          >
            <span class="truncate">
              <BaseIcon name="project" class="size-4" />
              {{ branch.name }}
            </span>
          </span>

          <BaseButton
            icon="pencil"
            variant="ghost"
            icon-class="size-4"
            class="size-7 p-0"
            :disabled="branch.id === MAIN_BRANCH_ID"
            @click="startEdit(branch)"
          />

          <ConfirmPopup
            title="Delete project?"
            message="All tasks in this project will be deleted!"
            confirm-text="Delete"
            cancel-text="Cancel"
            position="end"
            content-class="max-w-72"
            @confirm="deleteProject(branch)"
          >
            <template #trigger="{show}">
              <BaseButton
                icon="trash"
                variant="ghost"
                icon-class="size-4"
                class="text-error hover:bg-error/10 size-7 p-0"
                :disabled="branch.id === MAIN_BRANCH_ID"
                @click="show"
              />
            </template>
          </ConfirmPopup>
        </div>
      </div>
    </div>
  </div>
</template>
