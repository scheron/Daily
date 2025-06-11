<script setup lang="ts">
import {computed, ref, useTemplateRef} from "vue"
import {until} from "@vueuse/core"

import {toFullDate} from "@/utils/date"
import {useTasksStore} from "@/stores/tasks.store"
import BaseButton from "@/ui/base/BaseButton.vue"

const tasksStore = useTasksStore()

const inputRef = useTemplateRef<HTMLInputElement>("input")

const formValue = ref("")
const isFormOpened = ref(false)

const dayTitle = computed(() => tasksStore.activeDayInfo?.subtitle ?? "")
const formattedDate = computed(() => toFullDate(tasksStore.activeDay ?? new Date()))

async function startEditingDayTitle() {
  formValue.value = dayTitle.value || formattedDate.value
  isFormOpened.value = true

  await until(inputRef).toBeTruthy()
  inputRef.value?.focus()
}

async function onSave() {
  if (!formValue.value.trim()) return

  await tasksStore.updateDayTitle(tasksStore.activeDayInfo?.date, formValue.value)

  isFormOpened.value = false
}

function onCancel() {
  isFormOpened.value = false
}
</script>

<template>
  <form v-if="isFormOpened" class="flex" @submit.prevent="onSave" @keydown.enter="onSave" @keydown.esc="onCancel">
    <input
      ref="input"
      v-model="formValue"
      placeholder="Edit day title..."
      :maxlength="30"
      class="text-base-content w-36 placeholder-base-content/70 focus:shadow-base-content/70 shadow-base-content/20 flex-1 border-0 px-0 py-1 text-lg font-bold shadow-[0_-1px_0_inset] placeholder:font-normal focus:outline-none select-none"
      style="-webkit-app-region: no-drag"
      @blur="onCancel"
    />
  </form>

  <div v-else class="relative select-none flex w-full items-center gap-2 truncate">
    <h1 class="m-0 cursor-default truncate text-start text-lg font-bold">
      {{ dayTitle || formattedDate }}
    </h1>

    <BaseButton variant="text" icon-class="size-4" class="p-0" icon="pencil" style="-webkit-app-region: no-drag" @click="startEditingDayTitle" />
  </div>
</template>
