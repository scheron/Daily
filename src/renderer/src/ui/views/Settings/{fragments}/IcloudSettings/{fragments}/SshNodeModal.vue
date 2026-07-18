<script setup lang="ts">
import {computed, ref} from "vue"

import BaseButton from "@/ui/base/BaseButton"
import BaseInput from "@/ui/base/BaseInput.vue"
import {BaseModal} from "@/ui/base/BaseModal"

const props = defineProps<{
  /** Initial SSH host alias to prefill the form. */
  host: string
  /** Initial remote sync folder to prefill the form. */
  dir: string
}>()

const emit = defineEmits<{
  apply: [{host: string; dir: string}]
  close: []
}>()

const host = ref(props.host)
const dir = ref(props.dir)

const canApply = computed(() => host.value.trim().length > 0 && dir.value.trim().length > 0)

function onApply() {
  if (!canApply.value) return
  emit("apply", {host: host.value.trim(), dir: dir.value.trim()})
}
</script>

<template>
  <BaseModal title="SSH Node" container-class="mx-4 h-auto w-full max-w-md rounded-xl" content-class="!p-5" @close="$emit('close')">
    <div class="flex flex-col gap-4">
      <label class="flex flex-col gap-1">
        <span class="text-base-content text-sm">Host</span>
        <span class="text-base-content/60 text-xs">Alias from ~/.ssh/config</span>
        <BaseInput v-model="host" placeholder="my-server" focus-on-mount class="mt-1 text-sm" @keyup.enter="onApply" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-base-content text-sm">Remote sync folder</span>
        <span class="text-base-content/60 text-xs">Absolute path to the sync folder on the host</span>
        <BaseInput v-model="dir" placeholder="/home/<user>/.local/share/daily/sync" class="mt-1 text-sm" @keyup.enter="onApply" />
      </label>

      <div class="mt-2 flex justify-end gap-2">
        <BaseButton variant="ghost" class="h-8 px-3 text-sm" @click="$emit('close')">Cancel</BaseButton>
        <BaseButton variant="primary" class="h-8 px-3 text-sm" :disabled="!canApply" @click="onApply">Apply</BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
