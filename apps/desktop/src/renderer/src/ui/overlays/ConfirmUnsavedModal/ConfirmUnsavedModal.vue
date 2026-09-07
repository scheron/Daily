<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import {BaseModal} from "@/ui/base/BaseModal"

defineEmits<{
  save: []
  discard: []
  cancel: []
  close: []
}>()
</script>

<template>
  <BaseModal hide-header container-class="mx-4 h-auto w-full max-w-md rounded-xl" content-class="!p-5" @close="$emit('close')">
    <div class="mb-2 flex items-center gap-3">
      <BaseIcon name="alert-circle" class="text-warning size-7" />
      <h2 class="text-base-content text-lg font-semibold">You have unsaved changes</h2>
    </div>
    <p class="text-base-content/70 mt-1 text-sm">Your current changes haven’t been saved.</p>
    <p class="text-base-content/70 mt-1 text-sm">You can save, discard, or keep editing.</p>

    <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <BaseButton variant="ghost" class="h-8 px-3 text-sm" @click="$emit('cancel')">Keep Editing</BaseButton>
      <BaseButton variant="ghost" class="text-error hover:bg-error/10 h-8 px-3 text-sm sm:-order-1" @click="$emit('discard')">Discard</BaseButton>
      <BaseButton variant="primary" class="h-8 px-3 text-sm" @click="$emit('save')">Save Changes</BaseButton>
    </div>
  </BaseModal>
</template>
