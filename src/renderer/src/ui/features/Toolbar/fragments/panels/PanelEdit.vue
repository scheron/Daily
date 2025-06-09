<script setup lang="ts">
import {computed} from "vue"
import BaseButton from "@/ui/base/BaseButton.vue"

const props = defineProps<{newTask: boolean; modelValue: string}>()
const emit = defineEmits<{"update:modelValue": [string]; cancel: []; update: [string]; create: [string]}>()

const content = computed({
  get: () => props.modelValue,
  set: (content) => emit("update:modelValue", content),
})

function onSave() {
  if (!content.value.trim()) return

  if (props.newTask) emit("create", content.value.trim())
  else emit("update", content.value.trim())

  emit("cancel")
}
</script>

<template>
  <div class="bg-base-100 flex size-full items-center justify-between px-4 py-2">
    <h2 class="text-base-content text-lg">{{ props.newTask ? "Create task" : "Update task" }}</h2>

    <div class="flex items-center gap-2">
      <BaseButton variant="text" icon-class="size-4" icon="undo" @click="emit('cancel')"> Cancel </BaseButton>
      <BaseButton class="text-success" variant="text" icon="check" @click="onSave"> {{ props.newTask ? "Save" : "Update" }} </BaseButton>
    </div>
  </div>
</template>
