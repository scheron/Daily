<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"

import {useMilestonesStore} from "@/stores/milestones.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseCalendar from "@/ui/base/BaseCalendar"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import AutoSizeInput from "@/ui/common/inputs/AutoSizeInput.vue"

import type {ISODate, Milestone} from "@daily/protocol"

const props = withDefaults(defineProps<{milestone?: Milestone | null}>(), {milestone: null})
const emit = defineEmits<{done: []; cancel: []}>()

const milestonesStore = useMilestonesStore()

const name = ref(props.milestone?.name ?? "")
const description = ref(props.milestone?.description ?? "")
const date = ref<ISODate | null>(props.milestone?.date ?? null)
const isSaving = ref(false)

function clearDate() {
  date.value = null
}

async function submit() {
  const trimmedName = name.value.trim()
  if (!trimmedName || isSaving.value) return

  isSaving.value = true
  try {
    const payload = {name: trimmedName, date: date.value, description: description.value.trim() || null}
    const saved = props.milestone
      ? await milestonesStore.updateMilestone(props.milestone.id, payload)
      : await milestonesStore.createMilestone(payload)

    if (!saved) {
      toasts.error(props.milestone ? "Failed to update milestone" : "Failed to create milestone")
      return
    }

    toasts.success(props.milestone ? "Milestone updated" : "Milestone created")
    emit("done")
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="flex w-full flex-col gap-3 p-3">
    <div class="flex items-center gap-2">
      <BaseIcon name="bookmark" class="text-accent size-3.5" />
      <span class="text-base-content text-sm font-medium">{{ milestone ? "Edit milestone" : "New milestone" }}</span>
      <BaseButton icon="x-mark" variant="ghost" icon-class="size-3.5" class="ml-auto size-6 p-0" @click="emit('cancel')" />
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-base-content/55 text-[11px] font-semibold uppercase tracking-wide">Name <span class="text-error">*</span></span>
      <BaseInput v-model="name" placeholder="Milestone name" focus-on-mount class="text-xs" @keyup.enter="submit" />
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-base-content/55 text-[11px] font-semibold uppercase tracking-wide">Description</span>
      <AutoSizeInput
        v-model="description"
        placeholder="What counts as finished"
        class="border-base-300 min-h-16 rounded-lg border text-xs"
        :max-height="120"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <span class="text-base-content/55 text-[11px] font-semibold uppercase tracking-wide">Date</span>
        <BaseButton v-if="date" variant="text" size="sm" class="text-[11px]" @click="clearDate">Clear</BaseButton>
      </div>
      <BaseCalendar mode="single" :days="[]" :selected-date="date" size="sm" @select-date="date = $event" />
    </div>

    <div class="flex items-center gap-2 pt-1">
      <BaseButton variant="text" size="sm" class="h-8 flex-1" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton variant="primary" size="sm" class="h-8 flex-1" :disabled="!name.trim() || isSaving" @click="submit">
        {{ milestone ? "Save" : "Create" }}
      </BaseButton>
    </div>
  </div>
</template>
