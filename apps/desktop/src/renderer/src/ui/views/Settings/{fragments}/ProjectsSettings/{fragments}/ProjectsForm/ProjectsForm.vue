<script setup lang="ts">
import {computed, nextTick, ref, useTemplateRef} from "vue"

import {NO_PROJECT_ID} from "@daily/protocol"

import {toasts} from "@/composables/useToasts"
import {useBranchesStore} from "@/stores/branches"
import BaseButton from "@/ui/base/BaseButton"
import BaseInput from "@/ui/base/BaseInput.vue"
import ProjectIcon from "@/ui/common/(icons)/ProjectIcon.vue"
import ConfirmPopup from "@/ui/overlays/ConfirmPopup.vue"
import {getProjectName} from "@/utils/projects/getProjectName"
import {cn} from "@/utils/ui/tailwindcss"
import ProjectEmojiPicker from "./{fragments}/ProjectEmojiPicker.vue"

import type {Branch} from "@daily/protocol"

const props = defineProps<{selectedId: Branch["id"]}>()
const emit = defineEmits<{select: [id: Branch["id"]]}>()

const branchesStore = useBranchesStore()

const createInputRef = useTemplateRef<{focus: () => void}>("createInput")

const editor = ref<{type: "create"} | {type: "edit"; id: Branch["id"]} | null>(null)
const newProjectName = ref("")
const newProjectEmoji = ref<string | null>(null)
const editingName = ref("")
const editingEmoji = ref<string | null>(null)

const isCreating = computed(() => editor.value?.type === "create")
const editingId = computed(() => (editor.value?.type === "edit" ? editor.value.id : null))

function isSelected(branch: Branch): boolean {
  return props.selectedId === branch.id
}

function isActive(branch: Branch): boolean {
  return branchesStore.activeBranchId === branch.id
}

function startCreate() {
  cancelEdit()
  editor.value = {type: "create"}
  newProjectName.value = ""
  newProjectEmoji.value = null
  nextTick(() => createInputRef.value?.focus())
}

function cancelCreate() {
  editor.value = null
  newProjectName.value = ""
  newProjectEmoji.value = null
}

function startEdit(branch: Branch) {
  if (branch.id === NO_PROJECT_ID) return
  cancelCreate()
  editor.value = {type: "edit", id: branch.id}
  editingName.value = branch.name
  editingEmoji.value = branch.emoji ?? null
}

function cancelEdit() {
  editor.value = null
  editingName.value = ""
  editingEmoji.value = null
}

async function createProject() {
  const name = newProjectName.value.trim()
  if (!name) return

  const created = await branchesStore.createBranch(name, newProjectEmoji.value)
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
  if (id === NO_PROJECT_ID) {
    toasts.error("No project cannot be renamed")
    return
  }

  const updated = await branchesStore.updateBranchName(id, name, editingEmoji.value)
  if (!updated) {
    toasts.error("Failed to update project")
    return
  }

  cancelEdit()
  toasts.success("Project updated")
}

async function deleteProject(branch: Branch) {
  if (branch.id === NO_PROJECT_ID) {
    toasts.error("No project cannot be deleted")
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
  return cn("size-4 shrink-0", {"text-accent": isBranchActive && !isBranchSelected})
}

function getProjectButtonVariant(isBranchSelected: boolean) {
  return isBranchSelected ? "primary" : "ghost-muted"
}

function getProjectNameClasses(isBranchActive: boolean) {
  return cn("truncate", {"font-medium": isBranchActive})
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <BaseButton v-if="!editor" variant="dashed" icon="plus" size="sm" class="shrink-0 whitespace-nowrap" @click="startCreate">
      New project
    </BaseButton>

    <div v-else-if="isCreating" class="border-accent flex w-full min-w-0 items-center gap-2 rounded-full border-2 border-dashed px-4 py-0.5 text-sm">
      <ProjectEmojiPicker v-model="newProjectEmoji" />

      <BaseInput
        ref="createInput"
        v-model="newProjectName"
        bare
        hide-outline
        placeholder="New project"
        class="w-full min-w-0 flex-1 text-sm"
        @keyup.enter="createProject"
        @keyup.escape="cancelCreate"
      />

      <BaseButton variant="ghost" size="xs" aria-label="Create project" :disabled="!newProjectName.trim()" class="shrink-0" @click="createProject"
        >↵</BaseButton
      >
      <BaseButton icon="x-mark" variant="ghost" size="xs" aria-label="Cancel creating project" class="shrink-0" @click="cancelCreate" />
    </div>

    <template v-for="branch in branchesStore.orderedBranches" :key="branch.id">
      <div v-if="editingId === branch.id" class="border-accent flex w-full min-w-0 items-center gap-2 rounded-full border-2 px-4 py-0.5 text-sm">
        <ProjectEmojiPicker v-model="editingEmoji" />

        <BaseInput
          v-model="editingName"
          aria-label="Project name"
          bare
          hide-outline
          focus-on-mount
          class="w-full min-w-0 flex-1 text-sm"
          @keyup.enter="renameProject(branch.id)"
          @keyup.escape="cancelEdit"
        />

        <BaseButton
          icon="check"
          variant="ghost"
          size="xs"
          aria-label="Save project"
          :disabled="!editingName.trim()"
          class="shrink-0"
          @click="renameProject(branch.id)"
        />
        <BaseButton icon="x-mark" variant="ghost" size="xs" aria-label="Cancel editing project" class="shrink-0" @click="cancelEdit" />
      </div>

      <div v-else-if="!editor" class="flex shrink-0 items-center gap-0.5">
        <BaseButton :variant="getProjectButtonVariant(isSelected(branch))" size="sm" class="max-w-56" @click="emit('select', branch.id)">
          <ProjectIcon :project="branch" :class="getProjectIconClasses(isActive(branch), isSelected(branch))" />
          <span :class="getProjectNameClasses(isActive(branch))">{{ getProjectName(branch) }}</span>
        </BaseButton>

        <template v-if="isSelected(branch) && branch.id !== NO_PROJECT_ID">
          <BaseButton icon="pencil" variant="ghost" size="sm" :aria-label="`Edit ${branch.name}`" class="shrink-0" @click="startEdit(branch)" />

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
              <BaseButton icon="trash" variant="error-ghost" size="sm" class="shrink-0" @click="show" />
            </template>
          </ConfirmPopup>
        </template>
      </div>
    </template>
  </div>
</template>
