<script setup lang="ts">
import {toDateLabel} from "@daily/std"

import BaseIcon from "@/ui/base/BaseIcon"
import AgentRow from "./AgentRow.vue"

import type {ServerAgentView, ServerBindingView} from "@daily/protocol"

defineProps<{binding: ServerBindingView; agents: ServerAgentView[]}>()
</script>

<template>
  <table class="w-full border-collapse">
    <thead>
      <tr>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">This Mac · agents</th>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Last used</th>
        <th class="text-base-content/45 pb-1.5 pr-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em]">Added</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="border-base-300 border-t py-[9px] pr-2.5 text-[13px]">
          <div class="flex items-center gap-2">
            <BaseIcon name="desktop" class="text-base-content/45 size-4 shrink-0" />
            <span class="text-base-content">{{ binding.deviceName }}</span>
            <span class="text-accent bg-accent/14 rounded px-1.5 py-1 text-[10px] font-medium leading-none"> This Mac </span>
          </div>
        </td>
        <td class="border-base-300 text-base-content/60 border-t py-[9px] pr-2.5 text-xs">just now</td>
        <td class="border-base-300 text-base-content/60 border-t py-[9px] pr-2.5 text-xs">{{ toDateLabel(binding.boundAt, {short: true}) }}</td>
        <td class="border-base-300 border-t py-[9px] pr-0 text-right"></td>
      </tr>
      <AgentRow v-for="agent in agents" :key="agent.id" :agent="agent" />
    </tbody>
  </table>
</template>
