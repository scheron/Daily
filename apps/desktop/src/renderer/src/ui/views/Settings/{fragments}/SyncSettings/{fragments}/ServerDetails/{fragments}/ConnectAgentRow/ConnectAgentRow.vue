<script setup lang="ts">
import {computed, ref, watch} from "vue"
import {useIntervalFn} from "@vueuse/core"

import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import AgentIcon from "@/ui/common/sync/AgentIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"
import CopyField from "./{fragments}/CopyField.vue"
import {useWindowCountdown} from "../../useWindowCountdown"

import type {IconName} from "@/ui/base/BaseIcon"

const syncServerStore = useSyncServerStore()

const openAgentId = ref<string | null>("claude-code")

const expiresAt = computed(() => (syncServerStore.agentWindow?.isThisMac ? syncServerStore.agentWindow.expiresAt : null))

const isWaiting = computed(() => expiresAt.value !== null)

const agentAddress = computed(() => syncServerStore.agentWindow?.agentAddress ?? "")

const agents = computed(() => toAgents(agentAddress.value))

const {countdownLabel, countdownClass, isExpired} = useWindowCountdown(expiresAt, syncServerStore.listAgents)

const isPolling = computed(() => isWaiting.value && !isExpired.value)

const {pause, resume} = useIntervalFn(syncServerStore.listAgents, 3_000, {immediate: false})

function toAgents(mcpUrl: string): {id: string; name: string; steps: {text: string; copy?: string; mark?: IconName; textAfter?: string}[]}[] {
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      steps: [
        {text: "Run in the terminal", copy: `claude mcp add --transport http daily ${mcpUrl}`},
        {text: "Then, inside Claude Code", copy: "/mcp"},
        {text: "Pick daily, then Authenticate"},
      ],
    },
    {
      id: "claude",
      name: "Claude",
      steps: [
        {text: "In Claude: Customize → Connectors →", mark: "plus", textAfter: "→ Add custom connector"},
        {text: "Paste this as the remote MCP server URL", copy: mcpUrl},
        {text: "Press Add, then Connect, and sign in"},
      ],
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      steps: [
        {text: "In ChatGPT: Settings → Apps & Connectors → Advanced settings → turn on Developer mode"},
        {text: "Back in Apps & Connectors, press Create and paste this as the MCP server URL", copy: mcpUrl},
        {text: "Press Create, and sign in"},
      ],
    },
    {
      id: "codex",
      name: "Codex",
      steps: [
        {text: "Run in the terminal", copy: `codex mcp add daily --url ${mcpUrl}`},
        {text: "Then sign in", copy: "codex mcp login daily"},
        {text: "Approve in the browser"},
      ],
    },
  ]
}

function onToggle(agentId: string) {
  openAgentId.value = openAgentId.value === agentId ? null : agentId
}

async function onCancel() {
  try {
    await syncServerStore.closeAgentWindow()
  } catch (error) {
    console.error("Failed to close the Agent window:", error)
  }
}

function getItemClasses(index: number) {
  return cn(index > 0 && "border-base-300 border-t")
}

function getHeadClasses(isOpen: boolean) {
  return cn(
    "hover:bg-base-content/[2.5%] flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors",
    isOpen ? "text-accent" : "text-base-content",
  )
}

function getChevronClasses(isOpen: boolean) {
  return cn("size-3.5 shrink-0 transition-transform", isOpen ? "text-accent rotate-180" : "text-base-content/40")
}

function getStepTextClasses(hasField: boolean) {
  return cn("text-[13px] leading-snug", hasField ? "mb-1.5" : "text-base-content/70")
}

watch(isPolling, (value) => (value ? resume() : pause()), {immediate: true})
</script>

<template>
  <div v-if="isWaiting" class="border-base-300 bg-base-200 -mx-6 mt-6 flex flex-col gap-3 border-b border-t px-6 py-[13px]">
    <div class="flex items-start justify-between gap-6">
      <div class="flex min-w-0 flex-col gap-0.5">
        <p class="text-base-content text-sm font-medium">Waiting for an agent to ask</p>
        <p class="text-base-content/60 text-xs">
          Open the agent you use and follow its steps — Daily asks to approve it, then it joins the table above.
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2.5">
        <span :class="countdownClass">
          <BaseIcon name="spinner-arc" class="size-3.5 animate-spin" />
          {{ countdownLabel }} left
        </span>
        <BaseButton variant="ghost" @click="onCancel">Cancel</BaseButton>
      </div>
    </div>

    <div class="border-base-300 bg-base-100 overflow-hidden rounded-[10px] border">
      <div v-for="(agent, agentIndex) in agents" :key="agent.id" :class="getItemClasses(agentIndex)">
        <button :class="getHeadClasses(openAgentId === agent.id)" @click="onToggle(agent.id)">
          <AgentIcon :name="agent.name" class="size-4" />
          <span class="flex-1 font-medium">{{ agent.name }}</span>
          <BaseIcon name="chevron-down" :class="getChevronClasses(openAgentId === agent.id)" />
        </button>

        <ol v-if="openAgentId === agent.id" class="flex flex-col gap-3 pb-4 pl-[34px] pr-3 pt-0.5">
          <li v-for="(step, stepIndex) in agent.steps" :key="step.text" class="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2.5">
            <span class="bg-base-content/10 text-base-content/65 mt-px grid size-5 place-items-center rounded-full text-[10px] font-semibold">
              {{ stepIndex + 1 }}
            </span>
            <div class="min-w-0">
              <p :class="getStepTextClasses(Boolean(step.copy))">
                {{ step.text }}
                <span
                  v-if="step.mark"
                  class="bg-base-content/10 text-base-content/65 mx-0.5 mb-px inline-flex size-4 items-center justify-center rounded-full align-middle"
                >
                  <BaseIcon :name="step.mark" class="size-2.5" />
                </span>
                <template v-if="step.textAfter">{{ step.textAfter }}</template>
              </p>
              <CopyField v-if="step.copy" :value="step.copy" />
            </div>
          </li>
        </ol>
      </div>
    </div>
  </div>
</template>
