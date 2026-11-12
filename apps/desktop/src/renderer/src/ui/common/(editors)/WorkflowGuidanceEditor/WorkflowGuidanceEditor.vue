<script setup lang="ts">
import {computed, useId} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import {useWorkflowGuidanceForm} from "./composables/useWorkflowGuidanceForm"

import type {WorkflowGuidanceScope} from "@daily/protocol"

const props = defineProps<{scope: WorkflowGuidanceScope}>()

const fieldId = useId()
const policyId = useId()

const {
  guidance,
  document,
  content,
  completionChoice,
  effectiveAllowCompletion,
  savedAllowCompletion,
  currentDocument,
  isProject,
  isLoading,
  isSaving,
  hasConflict,
  error,
  saved,
  refreshNotice,
  isDirty,
  load,
  save,
} = useWorkflowGuidanceForm(() => props.scope)

const guidanceLabel = computed(() => (isProject.value ? "Project instructions" : "Workspace instructions"))
const emptyHistoryLabel = computed(() =>
  isProject.value
    ? "No project revisions yet. Workspace guidance is inherited until project instructions or a completion override are saved."
    : "The shipped defaults are in use. Saving creates the first revision.",
)
const policyDescription = computed(() => {
  const description = effectiveAllowCompletion.value
    ? "Agents may mark tasks done or cancelled in this scope. Ordinary task rules still apply."
    : "Agents leave completion and cancellation for a person to review."
  return isDirty.value ? `Selected setting: ${description}` : description
})
const savedPolicyDescription = computed(() =>
  savedAllowCompletion.value
    ? "Current saved permission: agents may complete or cancel tasks."
    : "Current saved permission: completion and cancellation require human review.",
)

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

function getPolicyLabel(value: boolean | null) {
  return value === null ? "Inherit workspace" : value ? "Allow agent completion" : "Require human review"
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-base-content/75 text-[13px] leading-relaxed">
      <template v-if="isProject">Project instructions add to workspace guidance and take precedence when workflow preferences conflict.</template>
      <template v-else
        >These instructions apply to every project. A project's instructions take precedence when workflow preferences conflict.</template
      >
    </p>

    <div v-if="isLoading" role="status" class="bg-base-200 h-32 animate-pulse rounded-lg"><span class="sr-only">Loading guidance</span></div>
    <template v-else-if="document">
      <p
        v-if="refreshNotice"
        role="status"
        class="border-accent/25 bg-accent/5 text-base-content/90 rounded-md border px-3 py-2 text-[13px] leading-relaxed"
      >
        {{ refreshNotice }}
      </p>
      <div class="flex flex-col gap-1.5">
        <label :for="fieldId" class="text-sm font-medium">{{ guidanceLabel }}</label>
        <textarea
          :id="fieldId"
          v-model="content"
          rows="7"
          maxlength="100000"
          spellcheck="false"
          class="border-base-300 bg-base-100 focus:border-accent focus:outline-accent min-h-36 w-full resize-y rounded-lg border px-3 py-2 text-[13px] leading-relaxed focus:outline focus:outline-1"
          :disabled="isSaving"
          placeholder="Describe how agents should prepare, work, and hand tasks back."
        />
        <p class="text-base-content/65 text-xs leading-relaxed">
          Guidance describes preferences. Permissions come from the completion setting below; instructions cannot grant capabilities.
        </p>
        <p class="text-base-content/65 text-xs leading-relaxed">
          Guidance and revision history sync and are shared with connected agents. Keep credentials out.
        </p>
      </div>

      <div class="flex flex-col gap-1.5">
        <label :for="policyId" class="text-sm font-medium">Agent completion</label>
        <select
          :id="policyId"
          v-model="completionChoice"
          :disabled="isSaving"
          class="border-base-300 bg-base-100 focus:outline-accent w-fit max-w-full rounded-md border px-2.5 py-2 text-[13px] focus:outline focus:outline-1"
        >
          <option v-if="isProject" value="inherit">Inherit workspace</option>
          <option value="review">Require human review</option>
          <option value="allow">Allow agents to complete or cancel tasks</option>
        </select>
        <p class="text-base-content/75 text-xs leading-relaxed">{{ policyDescription }}</p>
        <p v-if="isDirty || hasConflict || refreshNotice" class="text-base-content/90 text-xs leading-relaxed">{{ savedPolicyDescription }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <BaseButton variant="primary" size="sm" :disabled="!isDirty || hasConflict" :loading="isSaving" @click="save">Save guidance</BaseButton>
        <BaseButton v-if="isDirty || hasConflict" variant="ghost-muted" size="sm" :disabled="isSaving" @click="load()"
          >Load saved guidance</BaseButton
        >
        <span v-if="saved && !isDirty" role="status" class="text-base-content/85 text-xs">Guidance saved</span>
      </div>

      <details v-if="isProject && guidance" class="text-[13px]">
        <summary class="text-base-content/75 focus-visible:outline-accent cursor-pointer rounded py-1 focus-visible:outline">
          Workspace guidance
        </summary>
        <p class="text-base-content/75 mt-2 whitespace-pre-wrap leading-relaxed">{{ guidance.workspace.content }}</p>
        <p class="text-base-content/75 mt-2 text-xs">{{ getPolicyLabel(guidance.workspace.allowCompletion) }}</p>
      </details>

      <details class="text-[13px]">
        <summary class="text-base-content/75 focus-visible:outline-accent cursor-pointer rounded py-1 focus-visible:outline">
          Revision history ({{ currentDocument?.history.length ?? 0 }})
        </summary>
        <p v-if="!currentDocument?.history.length" class="text-base-content/65 py-2 text-xs">
          {{ emptyHistoryLabel }}
        </p>
        <ol v-else class="divide-base-300 divide-y">
          <li v-for="revision in currentDocument?.history.toReversed()" :key="revision.id" class="py-3">
            <p class="text-base-content/75 text-xs">{{ formatDate(revision.createdAt) }} · {{ getPolicyLabel(revision.allowCompletion) }}</p>
            <p class="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed">{{ revision.content || "No project instructions" }}</p>
          </li>
        </ol>
      </details>
    </template>

    <div v-if="error" role="alert" class="border-error/30 bg-error/5 text-base-content/90 rounded-md border px-3 py-2 text-[13px] leading-relaxed">
      <p>{{ error }}</p>
      <p v-if="hasConflict" class="mt-1">
        The draft is still here. Copy any changes to keep, then load the saved guidance and review before saving again.
      </p>
      <BaseButton v-else-if="!document" variant="ghost-muted" size="sm" class="mt-2" @click="load()">Try again</BaseButton>
    </div>
  </div>
</template>
