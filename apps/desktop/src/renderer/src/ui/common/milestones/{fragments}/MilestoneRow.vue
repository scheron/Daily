<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {toasts} from "vue-toasts-lite"

import {isMilestoneClosed, isMilestoneOverdue, milestoneCompletion} from "@daily/protocol"
import {getToday, toDateLabel} from "@daily/std"

import {useMilestonesStore} from "@/stores/milestones.store"
import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import BasePopup from "@/ui/base/BasePopup.vue"
import MilestoneDiamond from "@/ui/common/milestones/MilestoneDiamond.vue"
import MarkdownEditor from "@/ui/modules/RightPanel/{fragments}/Editor/{fragments}/MarkdownEditor.vue"
import {ConfirmPopup} from "@/ui/overlays/ConfirmPopup"

import type {ISODate, MilestoneView} from "@daily/protocol"

const props = defineProps<{milestone: MilestoneView; expanded: boolean}>()
const emit = defineEmits<{toggle: []; delete: []}>()

const milestonesStore = useMilestonesStore()
const tasksStore = useTasksStore()

const isEditingName = ref(false)
const editingName = ref("")

const localDescription = ref(props.milestone.description)

const completion = computed(() => milestoneCompletion(props.milestone.progress))
const closed = computed(() => isMilestoneClosed(props.milestone.progress))
const overdue = computed(() => isMilestoneOverdue(props.milestone, props.milestone.progress, getToday()))
const dateLabel = computed(() => (props.milestone.targetDate ? toDateLabel(props.milestone.targetDate, {short: true}) : null))
const percentLabel = computed(() => `${Math.round(completion.value * 100)}%`)

watch(
  () => props.milestone.id,
  () => {
    localDescription.value = props.milestone.description
  },
)

watch(
  () => props.milestone.description,
  (next) => {
    if (next === localDescription.value) return
    localDescription.value = next
  },
)

function startEdit() {
  isEditingName.value = true
  editingName.value = props.milestone.name
}

function cancelEdit() {
  isEditingName.value = false
  editingName.value = ""
}

async function saveRename() {
  const name = editingName.value.trim()
  isEditingName.value = false
  if (!name || name === props.milestone.name) return

  const updated = await milestonesStore.updateMilestone(props.milestone.id, {name})
  if (!updated) toasts.error("Failed to rename milestone")
}

async function selectDate(date: ISODate, hide: () => void) {
  hide()
  if (date === props.milestone.targetDate) return

  const updated = await milestonesStore.updateMilestone(props.milestone.id, {targetDate: date})
  if (!updated) toasts.error("Failed to set target date")
}

async function clearDate(hide: () => void) {
  hide()
  if (props.milestone.targetDate === null) return

  const updated = await milestonesStore.updateMilestone(props.milestone.id, {targetDate: null})
  if (!updated) toasts.error("Failed to clear target date")
}

function saveDescription() {
  if (localDescription.value === props.milestone.description) return
  milestonesStore.updateMilestone(props.milestone.id, {description: localDescription.value})
}
</script>

<template>
  <div class="border-base-300/70 border-b last:border-b-0">
    <div
      class="group hover:bg-base-200/60 flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors"
      :class="{'opacity-50': closed}"
      @click="emit('toggle')"
    >
      <span
        class="ms-drag-handle text-base-content/25 hover:text-base-content/60 flex shrink-0 cursor-grab items-center transition-colors"
        @click.stop
      >
        <BaseIcon name="drag-vertical" class="size-3.5" />
      </span>

      <BaseIcon :name="expanded ? 'chevron-down' : 'chevron-right'" class="text-base-content/40 size-3 shrink-0" />

      <MilestoneDiamond :completion="completion" :overdue="overdue" :size="13" />

      <BaseInput
        v-if="isEditingName"
        v-model="editingName"
        bare
        hide-outline
        focus-on-mount
        class="h-full max-w-40 flex-none text-sm font-medium"
        @click.stop
        @keyup.enter="saveRename"
        @keyup.escape="cancelEdit"
        @blur="saveRename"
      />
      <span v-else class="min-w-0 flex-1 truncate font-medium">{{ milestone.name }}</span>

      <div class="text-base-content/55 ml-auto flex shrink-0 items-center text-xs">
        <BasePopup hide-header position="end" trigger-class="w-24 shrink-0" container-class="max-h-none">
          <template #trigger="{toggle}">
            <BaseButton
              variant="text"
              :class="[
                'w-full justify-end truncate p-0 text-right text-xs whitespace-nowrap',
                !milestone.targetDate && 'text-base-content/35 italic',
                overdue && 'text-error font-semibold',
              ]"
              @click.stop="toggle"
            >
              {{ dateLabel ?? "Set a date" }}
            </BaseButton>
          </template>

          <template #default="{hide}">
            <div class="flex flex-col gap-1 p-1">
              <BaseCalendar
                mode="single"
                :days="tasksStore.days"
                :selected-date="milestone.targetDate"
                size="sm"
                @select-date="selectDate($event, hide)"
              />
              <BaseButton v-if="milestone.targetDate" variant="ghost" size="sm" class="justify-center" @click="clearDate(hide)"
                >Clear date</BaseButton
              >
            </div>
          </template>
        </BasePopup>

        <span class="w-16 shrink-0 text-right tabular-nums">{{ milestone.progress.total }} tasks</span>
        <span class="w-10 shrink-0 text-right tabular-nums">{{ percentLabel }}</span>

        <div
          class="flex w-14 shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <BaseButton icon="pencil" variant="ghost" icon-class="size-3.5" class="size-6 p-0" @click.stop="startEdit" />

          <ConfirmPopup
            title="Delete milestone?"
            message="The milestone is removed. Its tasks are not — they just lose it."
            confirm-text="Delete"
            cancel-text="Cancel"
            position="end"
            content-class="max-w-72"
            @confirm="emit('delete')"
          >
            <template #trigger="{show}">
              <BaseButton icon="trash" variant="ghost" icon-class="size-3.5" class="text-error hover:bg-error/10 size-6 p-0" @click.stop="show" />
            </template>
          </ConfirmPopup>
        </div>
      </div>
    </div>

    <div v-if="expanded" class="pb-3 pl-18">
      <MarkdownEditor class="h-28" :content="localDescription" @update:content="localDescription = $event" @focusout="saveDescription" />
    </div>
  </div>
</template>
