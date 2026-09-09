<script setup lang="ts">
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {DateTime} from "luxon"

import {toDateLabel} from "@daily/std"

import {useMilestonesStore} from "@/stores/milestones.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"
import AutoSizeInput from "@/ui/common/inputs/AutoSizeInput.vue"
import DayPicker from "@/ui/common/pickers/DayPicker.vue"

import type {ISODate, Milestone} from "@daily/protocol"

const props = withDefaults(defineProps<{milestone?: Milestone | null}>(), {milestone: null})
const emit = defineEmits<{done: []; cancel: []}>()

const TODAY = DateTime.now().toISODate()!

const milestonesStore = useMilestonesStore()

const name = ref(props.milestone?.name ?? "")
const date = ref<ISODate | null>(props.milestone?.date ?? null)
const description = ref(props.milestone?.description ?? "")
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
      <span class="text-base-content/55 text-[11px] font-semibold uppercase tracking-wide">
        Date <span class="text-base-content/40 normal-case">— optional</span>
      </span>
      <DayPicker :days="[]" :active-day="date ?? TODAY" :selected-day="date" hide-on-select position="start" @select="date = $event">
        <template #trigger="{toggle}">
          <div
            class="border-base-300 hover:border-base-content/30 flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs transition-colors"
            :class="date ? 'text-base-content' : 'text-base-content/45'"
            @click="toggle"
          >
            <BaseIcon name="calendar" class="size-3.5 shrink-0" />
            <span class="flex-1 truncate">{{ date ? toDateLabel(date, {short: true}) : "Pick a day" }}</span>
            <BaseButton v-if="date" icon="x" variant="ghost" icon-class="size-2.5" class="size-4 shrink-0 p-0" @click.stop="clearDate" />
          </div>
        </template>
      </DayPicker>
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-base-content/55 text-[11px] font-semibold uppercase tracking-wide">
        Description <span class="text-base-content/40 normal-case">— optional</span>
      </span>
      <AutoSizeInput
        v-model="description"
        placeholder="What counts as finished"
        class="border-base-300 rounded-lg border text-xs"
        :max-height="120"
      />
    </div>

    <div class="flex items-center gap-2 pt-1">
      <BaseButton variant="primary" size="sm" class="rounded-full px-4" :disabled="!name.trim() || isSaving" @click="submit">
        {{ milestone ? "Save" : "Create" }}
      </BaseButton>
      <BaseButton variant="text" size="sm" @click="emit('cancel')">Cancel</BaseButton>
    </div>
  </div>
</template>
