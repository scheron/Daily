<script setup lang="ts">
import {toDateLabel} from "@daily/std"

import AgentRow from "./AgentRow.vue"

import type {ServerAgentView, ServerBindingView} from "@daily/protocol"

defineProps<{binding: ServerBindingView; agents: ServerAgentView[]}>()
</script>

<template>
  <table class="mt-[18px] w-full border-collapse">
    <thead>
      <tr>
        <th class="text-base-content/45 pr-2.5 pb-1.5 text-left text-[11px] font-medium tracking-[0.06em] uppercase">This Mac · agents</th>
        <th class="text-base-content/45 pr-2.5 pb-1.5 text-left text-[11px] font-medium tracking-[0.06em] uppercase">Last used</th>
        <th class="text-base-content/45 pr-2.5 pb-1.5 text-left text-[11px] font-medium tracking-[0.06em] uppercase">Added</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="border-base-300 border-t py-[9px] pr-2.5 text-[13px]">
          <div class="flex items-center gap-2">
            <span class="bg-success size-2 shrink-0 rounded-full" />
            <span class="text-base-content">{{ binding.deviceName }}</span>
            <span class="text-accent bg-accent/14 rounded px-1.5 py-1 text-[10px] leading-none font-medium"> This Mac </span>
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
