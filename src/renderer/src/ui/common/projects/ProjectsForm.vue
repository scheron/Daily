<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {MAIN_BRANCH_ID} from "@shared/constants/storage"
import {useBranchesStore} from "@/stores/branches.store"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"

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
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="group focus-within:border-accent border-base-300 flex h-8 items-center gap-2 rounded-md border border-dashed px-2 transition-colors">
      <BaseIcon name="project" class="text-base-content/50 size-3.5 shrink-0" />

      <BaseInput v-model="newProjectName" bare hide-outline placeholder="New project" class="h-full flex-1 text-xs" @keyup.enter="createProject" />

      <button
        type="button"
        :disabled="!newProjectName.trim()"
        class="text-base-content/50 border-base-300 hover:text-base-content hover:border-base-content/30 disabled:hover:text-base-content/50 disabled:hover:border-base-300 shrink-0 rounded border px-1.5 text-[11px] leading-5 transition-colors disabled:opacity-40"
        @click="createProject"
      >
        ↵
      </button>
    </div>

    <div class="flex w-full flex-col gap-0.5">
      <div v-for="branch in branchesStore.orderedBranches" :key="branch.id">
        <div v-if="editingId === branch.id" class="border-base-300 focus-within:border-accent flex h-8 items-center gap-2 rounded-md border px-2">
          <BaseIcon name="project" class="text-base-content/50 size-3.5 shrink-0" />

          <BaseInput v-model="editingName" bare hide-outline focus-on-mount class="h-full flex-1 text-xs" @keyup.enter="renameProject(branch.id)" />

          <BaseButton icon="check" variant="ghost" icon-class="size-4" class="size-6 shrink-0 p-0" @click="renameProject(branch.id)" />
          <BaseButton icon="x-mark" variant="ghost" icon-class="size-4" class="size-6 shrink-0 p-0" @click="cancelEdit" />
        </div>

        <div v-else class="group hover:bg-base-200 flex h-8 items-center gap-2 rounded-md px-2 transition-colors">
          <BaseIcon
            name="project"
            class="size-3.5 shrink-0"
            :class="branchesStore.activeBranchId === branch.id ? 'text-accent' : 'text-base-content/50'"
          />
          <span
            class="text-base-content/80 flex-1 truncate text-left text-xs"
            :class="{'text-accent font-medium': branchesStore.activeBranchId === branch.id}"
          >
            {{ branch.name }}
          </span>

          <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <BaseButton
              icon="pencil"
              variant="ghost"
              icon-class="size-4"
              class="size-6 p-0"
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
                  class="text-error hover:bg-error/10 size-6 p-0"
                  :disabled="branch.id === MAIN_BRANCH_ID"
                  @click="show"
                />
              </template>
            </ConfirmPopup>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
