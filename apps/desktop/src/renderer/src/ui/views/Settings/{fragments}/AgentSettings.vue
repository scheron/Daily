<script setup lang="ts">
import WorkflowGuidanceEditor from "@/ui/common/(editors)/WorkflowGuidanceEditor"

import type {WorkflowGuidanceScope} from "@daily/protocol"

const scope: WorkflowGuidanceScope = {kind: "workspace"}
</script>

<template>
  <div class="flex flex-col gap-5 py-2">
    <div>
      <h1 class="text-base font-semibold">Agent guidance</h1>
      <p class="text-base-content/75 mt-1 text-[13px] leading-relaxed">
        Set shared working preferences for connected agents and Daily AI. Project guidance is edited in Projects.
      </p>
    </div>
    <WorkflowGuidanceEditor :scope="scope" />
  </div>
</template>
