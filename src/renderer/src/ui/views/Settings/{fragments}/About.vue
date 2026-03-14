<script setup lang="ts">
import BaseIcon from "@/ui/base/BaseIcon"
import Logo from "@/ui/common/misc/Logo.vue"
</script>

<template>
  <div class="flex flex-1 flex-col pb-4">
    <div class="space-y-2">
      <h3 class="text-base font-semibold">Elevate Your Productivity</h3>
      <p class="text-base-content/80 flex items-start gap-2 text-sm">
        Track your tasks any day in
        <Logo class="text-accent h-4" />
      </p>
    </div>

    <div class="mt-4 space-y-2">
      <ul class="text-base-content/80 space-y-1 text-sm">
        <li><BaseIcon name="sparkles" class="text-accent mr-2 size-4" /> <span class="font-medium">Elegant UI</span></li>
        <li><BaseIcon name="markdown" class="text-accent mr-2 size-4" /> <span class="font-medium">Markdown Support</span></li>
        <li><BaseIcon name="ai" class="text-accent mr-2 size-4" /> <span class="font-medium">Workflow with AI</span></li>
        <li><BaseIcon name="cloud" class="text-accent mr-2 size-4" /> <span class="font-medium">Connect multiple devices with iCloud</span></li>
        <li>
          <BaseIcon name="background" class="text-accent mr-2 size-4" />
          <span class="font-medium">Multiple themes</span>
        </li>
      </ul>
    </div>

    <div class="text-base-content/60 mt-4 text-xs">
      <p>Made with ❤️ by <a href="https://github.com/scheron" target="_blank" class="text-accent hover:underline">Scheron</a></p>
    </div>
  </div>
</template>
