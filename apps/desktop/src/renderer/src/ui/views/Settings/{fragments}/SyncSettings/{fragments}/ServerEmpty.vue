<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"

const emit = defineEmits<{connect: []}>()
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex items-start justify-between gap-6">
      <div class="flex min-w-0 items-start gap-2.5">
        <BaseIcon name="server" class="text-base-content/60 mt-1.5 size-4 shrink-0" />
        <div class="min-w-0">
          <h2 class="text-base-content text-xl font-semibold leading-tight tracking-[-0.01em]">Daily Server</h2>
          <p class="text-base-content/60 mt-1 text-[13px]">Sync this Mac with a server you run — and let your agents reach these tasks.</p>
        </div>
      </div>

      <BaseButton variant="primary" icon="cloud" @click="emit('connect')">Connect</BaseButton>
    </div>

    <span
      class="text-base-content/55 bg-base-content/8 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium leading-none"
    >
      <span class="size-2 shrink-0 rounded-full bg-current" />
      Not connected
    </span>
  </div>
</template>
