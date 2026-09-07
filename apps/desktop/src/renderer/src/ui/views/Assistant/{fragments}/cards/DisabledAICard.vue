<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
</script>

<template>
  <div class="bg-info/10 border-info/20 mx-3 my-3 flex flex-col items-center justify-center gap-2 rounded-lg border px-4 py-2">
    <BaseIcon name="ai" class="text-info size-12" />

    <p class="text-info text-center text-sm">
      AI assistant is disabled. <br />
      For using AI, please enable it in settings.
    </p>
  </div>
</template>
