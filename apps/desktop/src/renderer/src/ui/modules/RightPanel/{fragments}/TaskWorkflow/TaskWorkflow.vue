<script setup lang="ts">
import {computed} from "vue"

import {toDurationLabel} from "@daily/std"

import {TASK_COLUMNS} from "@/constants/ui"
import {useBranchesStore} from "@/stores/branches"
import {useMilestonesStore} from "@/stores/milestones"
import {useTaskEditorStore} from "@/stores/task-editor"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {cn} from "@/utils/ui/tailwindcss"
import {useTaskWorkflow} from "./composables/useTaskWorkflow"

import type {AgentSessionState, Task, TaskWorkflowProposal, TaskWorkflowRecord, TaskWorkflowSession} from "@daily/protocol"

const SESSION_LABELS: Record<AgentSessionState, string> = {working: "Working", waiting: "Waiting", finished: "Finished", error: "Error"}

const props = defineProps<{taskId: string}>()

const taskEditorStore = useTaskEditorStore()
const branchesStore = useBranchesStore()
const milestonesStore = useMilestonesStore()

const {state, error, isLoading, isStale, resolvingId, notice, load, review} = useTaskWorkflow(() => props.taskId)

const pendingCount = computed(() => state.value?.proposals.filter((proposal) => proposal.status === "pending").length ?? 0)
const confirmedLabel = computed(() => toDurationLabel(state.value?.confirmedSeconds ?? 0, "0 min"))
const proposals = computed(() => state.value?.proposals.toReversed() ?? [])
const sessions = computed(() => state.value?.sessions.toSorted((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId)) ?? [])

function getProposalStatusClasses(status: TaskWorkflowProposal["status"]) {
  return cn("text-base-content/85 rounded px-1.5 py-0.5 text-xs font-medium capitalize", {
    "bg-warning/12": status === "pending",
    "bg-success/12": status === "accepted",
    "bg-base-content/8": status === "rejected",
  })
}

function getSessionStateClasses(state: AgentSessionState, connection: TaskWorkflowSession["connection"]) {
  return cn("text-base-content/85 rounded px-1.5 py-0.5 text-xs font-medium", {
    "bg-accent/10": state === "working" && connection === "connected" && !isStale.value,
    "bg-warning/12": state === "waiting" || connection !== "connected" || isStale.value,
    "bg-success/12": state === "finished",
    "bg-error/10": state === "error",
  })
}

function sessionStateLabel(session: TaskWorkflowSession) {
  if (session.state === "finished" || session.state === "error") return SESSION_LABELS[session.state]
  if (isStale.value) return `Last reported ${SESSION_LABELS[session.state].toLowerCase()} · connection unconfirmed`
  if (session.connection === "connected") return `${SESSION_LABELS[session.state]} · recent report`
  return `Last reported ${SESSION_LABELS[session.state].toLowerCase()} · continuity unconfirmed`
}

function actorLabel(actorId: string) {
  const source = state.value?.records.find((record) => record.actorId === actorId)?.source
  return source?.kind === "manual" ? "Person" : (source?.provider ?? actorId)
}

function resolutionHistory(proposal: TaskWorkflowProposal) {
  return (
    state.value?.records
      .flatMap((record) =>
        record.command.kind === "resolve" && record.command.proposalId === proposal.id
          ? [{id: record.id, decision: record.command.decision, actor: actorLabel(record.actorId), at: formatDate(record.createdAt)}]
          : [],
      )
      .toReversed() ?? []
  )
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString()
}

function formatSchedule(value: Task["scheduled"] | undefined) {
  if (value === undefined) return "Original value unavailable"
  if (value === null) return "No date"
  return `${value.date}${value.time ? ` · ${value.time}` : ""}${value.timezone ? ` · ${value.timezone}` : ""}`
}

function proposalRows(proposal: TaskWorkflowProposal) {
  const rows: {label: string; before: string; after: string}[] = []
  if ("status" in proposal.changes)
    rows.push({
      label: "Status",
      before: TASK_COLUMNS.find((column) => column.status === proposal.originalValues.status)?.label ?? "Original value unavailable",
      after: TASK_COLUMNS.find((column) => column.status === proposal.changes.status)?.label ?? "Unavailable",
    })
  if ("scheduled" in proposal.changes)
    rows.push({label: "Schedule", before: formatSchedule(proposal.originalValues.scheduled), after: formatSchedule(proposal.changes.scheduled)})
  if ("estimatedTime" in proposal.changes)
    rows.push({
      label: "Estimate",
      before:
        proposal.originalValues.estimatedTime === undefined
          ? "Original value unavailable"
          : toDurationLabel(proposal.originalValues.estimatedTime, "No estimate"),
      after: toDurationLabel(proposal.changes.estimatedTime ?? 0, "No estimate"),
    })
  if ("priority" in proposal.changes)
    rows.push({
      label: "Priority",
      before: proposal.originalValues.priority ?? "Original value unavailable",
      after: proposal.changes.priority ?? "none",
    })
  if ("content" in proposal.changes)
    rows.push({label: "Content", before: proposal.originalValues.content ?? "Original value unavailable", after: proposal.changes.content ?? ""})
  if ("branchId" in proposal.changes)
    rows.push({
      label: "Project",
      before:
        branchesStore.branchesMap.get(proposal.originalValues.branchId ?? "")?.name ??
        proposal.originalValues.branchId ??
        "Original value unavailable",
      after: branchesStore.branchesMap.get(proposal.changes.branchId ?? "")?.name ?? proposal.changes.branchId ?? "Unavailable",
    })
  if ("milestoneId" in proposal.changes)
    rows.push({
      label: "Milestone",
      before:
        proposal.originalValues.milestoneId === undefined
          ? "Original value unavailable"
          : proposal.originalValues.milestoneId === null
            ? "No milestone"
            : (milestonesStore.milestonesMap.get(proposal.originalValues.milestoneId)?.name ?? proposal.originalValues.milestoneId),
      after: proposal.changes.milestoneId
        ? (milestonesStore.milestonesMap.get(proposal.changes.milestoneId)?.name ?? proposal.changes.milestoneId)
        : "No milestone",
    })
  if ("tags" in proposal.changes)
    rows.push({
      label: "Tags",
      before:
        proposal.originalValues.tags === undefined
          ? "Original value unavailable"
          : proposal.originalValues.tags.map((tag) => tag.name).join(", ") || "No tags",
      after: proposal.changes.tags?.map((tag) => tag.name).join(", ") || "No tags",
    })
  if ("orderIndex" in proposal.changes)
    rows.push({
      label: "Order",
      before: proposal.originalValues.orderIndex === undefined ? "Original value unavailable" : String(proposal.originalValues.orderIndex),
      after: String(proposal.changes.orderIndex),
    })
  if ("deletedAt" in proposal.changes)
    rows.push({
      label: "Availability",
      before:
        proposal.originalValues.deletedAt === undefined
          ? "Original value unavailable"
          : proposal.originalValues.deletedAt
            ? `Deleted · ${proposal.originalValues.deletedAt}`
            : "Active",
      after: proposal.changes.deletedAt ? `Deleted · ${proposal.changes.deletedAt}` : "Active (restored)",
    })
  return rows
}

function sessionHistory(session: TaskWorkflowSession) {
  return (
    state.value?.records
      .filter(
        (record) =>
          record.actorId === session.actorId &&
          (record.sessionId === session.sessionId || ("sessionId" in record.command && record.command.sessionId === session.sessionId)),
      )
      .toReversed() ?? []
  )
}

function recordLabel(record: TaskWorkflowRecord) {
  if (record.command.kind === "session_update")
    return `${SESSION_LABELS[record.command.state]}${record.command.summary ? ` · ${record.command.summary}` : ""}`
  if (record.command.kind === "session_start") return `${SESSION_LABELS.working}${record.command.summary ? ` · ${record.command.summary}` : ""}`
  if (record.command.kind === "pause") return SESSION_LABELS.waiting
  if (record.command.kind === "propose") return `planning proposal · ${record.command.reason}`
  if (record.command.kind === "transition") return `task status · ${"status" in record.command ? record.command.status : record.command.stage}`
  return SESSION_LABELS.working
}

function recordTimeLabel(record: TaskWorkflowRecord) {
  return record.interval ? toDurationLabel(Math.floor((record.interval.to - record.interval.from) / 1000), "0 sec") : "No additional time confirmed"
}
</script>

<template>
  <section aria-label="Agent workflow" class="border-base-300/65 mx-4 mb-5 mt-4 border-y py-4">
    <div class="flex items-center gap-2">
      <BaseIcon name="bot" class="text-base-content/75 size-4" />
      <h2 class="flex-1 text-sm font-semibold">Agent workflow</h2>
      <BaseButton variant="ghost-muted" size="xs" icon="refresh" aria-label="Refresh agent activity" :loading="isLoading" @click="load()" />
    </div>

    <p v-if="isLoading && !state" role="status" class="text-base-content/75 mt-3 text-[13px]">Loading agent activity…</p>
    <template v-if="state">
      <p v-if="!proposals.length && !sessions.length" class="text-base-content/75 mt-3 text-[13px] leading-relaxed">
        Agents' planning proposals and work sessions appear here. Task status and time remain editable above.
      </p>

      <details v-if="proposals.length" :open="pendingCount > 0" class="mt-4">
        <summary class="focus-visible:outline-accent cursor-pointer rounded text-[13px] font-medium focus-visible:outline">
          Planning proposals ({{ proposals.length }}) · {{ pendingCount }} pending
        </summary>
        <div v-for="proposal in proposals" :key="proposal.id" class="border-base-300/65 mt-3 border-t pt-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-base-content/75 break-all text-xs">{{ actorLabel(proposal.actorId) }}</span>
            <span :class="getProposalStatusClasses(proposal.status)">{{ proposal.status }}</span>
          </div>
          <p class="my-2 whitespace-pre-wrap text-[13px] leading-relaxed">{{ proposal.reason }}</p>
          <table class="w-full table-fixed text-left text-xs leading-relaxed">
            <caption class="sr-only">
              Proposed task changes
            </caption>
            <thead class="text-base-content/75">
              <tr>
                <th scope="col" class="w-1/4 py-1 font-medium">Field</th>
                <th scope="col" class="px-2 py-1 font-medium">Current at proposal</th>
                <th scope="col" class="py-1 font-medium">Proposed</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in proposalRows(proposal)" :key="row.label" class="border-base-300/40 border-t">
                <th scope="row" class="py-2 align-top font-medium">{{ row.label }}</th>
                <td class="text-base-content/75 whitespace-pre-wrap break-words px-2 py-2 align-top">{{ row.before }}</td>
                <td class="whitespace-pre-wrap break-words py-2 align-top">{{ row.after }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="'branchId' in proposal.changes" class="text-base-content/85 mt-2 text-xs leading-relaxed">
            Comments follow the task to its new project. Relations to tasks in other projects are removed.
          </p>
          <p v-if="proposal.conflict && proposal.status !== 'pending'" class="text-base-content/85 mt-2 text-xs leading-relaxed">
            Different offline decisions were synced. The latest decision is shown. Review the current planning values and decision history.
          </p>
          <details v-if="resolutionHistory(proposal).length" class="mt-2 text-xs">
            <summary class="text-base-content/75 focus-visible:outline-accent cursor-pointer rounded focus-visible:outline">Decision history</summary>
            <ol class="mt-2 space-y-1.5">
              <li v-for="resolution in resolutionHistory(proposal)" :key="resolution.id" class="text-base-content/75 leading-relaxed">
                <span class="capitalize">{{ resolution.decision }}</span> · {{ resolution.actor }} · {{ resolution.at }}
              </li>
            </ol>
          </details>
          <template v-if="proposal.status === 'pending'">
            <p v-if="proposal.conflict" class="text-base-content/85 mt-2 text-xs leading-relaxed">
              Planning values changed after this proposal. Reject it and ask the agent for an updated proposal.
            </p>
            <p v-if="taskEditorStore.isDirty" class="text-base-content/85 mt-2 text-xs leading-relaxed">
              Save or discard task edits before reviewing this proposal.
            </p>
            <div class="mt-3 flex gap-2">
              <BaseButton
                variant="primary"
                size="xs"
                :disabled="proposal.conflict || taskEditorStore.isDirty || resolvingId !== null"
                :loading="resolvingId === proposal.id"
                @click="review(proposal.id, 'accepted')"
                >Accept proposal</BaseButton
              >
              <BaseButton
                variant="ghost-muted"
                size="xs"
                :disabled="taskEditorStore.isDirty || resolvingId !== null"
                @click="review(proposal.id, 'rejected')"
                >Reject</BaseButton
              >
            </div>
          </template>
        </div>
      </details>

      <div v-if="sessions.length" class="mt-5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-[13px] font-medium">Agent sessions</h3>
          <span class="text-base-content/75 text-xs tabular-nums">{{ confirmedLabel }} confirmed · overlaps counted once</span>
        </div>
        <article v-for="session in sessions" :key="`${session.actorId}:${session.sessionId}`" class="border-base-300/65 mt-3 border-t pt-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="break-all text-[13px] font-medium">{{ actorLabel(session.actorId) }}</span>
            <span :class="getSessionStateClasses(session.state, session.connection)">{{ sessionStateLabel(session) }}</span>
          </div>
          <p v-if="session.summary" class="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{{ session.summary }}</p>
          <p class="text-base-content/75 mt-1 text-xs">Updated {{ formatDate(session.updatedAt) }}</p>
          <p v-if="session.connection !== 'connected' || isStale" class="text-base-content/85 mt-1 text-xs leading-relaxed">
            This host cannot confirm continuity across hosts, restarts, or disconnects. Last reported activity is shown; unconfirmed tails add no
            time.
          </p>
          <details class="mt-2 text-xs">
            <summary class="text-base-content/75 focus-visible:outline-accent cursor-pointer rounded focus-visible:outline">Session history</summary>
            <ol class="mt-2 space-y-2">
              <li v-for="record in sessionHistory(session)" :key="record.id">
                <p class="whitespace-pre-wrap leading-relaxed">{{ recordLabel(record) }}</p>
                <p class="text-base-content/75 mt-0.5 tabular-nums">{{ formatDate(record.createdAt) }} · {{ recordTimeLabel(record) }}</p>
              </li>
            </ol>
          </details>
        </article>
      </div>

      <details class="text-base-content/75 mt-4 text-xs leading-relaxed">
        <summary class="focus-visible:outline-accent cursor-pointer rounded focus-visible:outline">How agent time works</summary>
        <p class="mt-2">
          Working intervals confirmed by two session updates, up to 30 minutes, count. Activity between updates is inferred, not verified. No
          heartbeats are required. Longer gaps, interrupted sessions, and unconfirmed tails add no time. Human corrections remain part of the task
          total.
        </p>
      </details>
    </template>
    <p v-if="notice" role="status" class="text-base-content/85 mt-3 text-[13px] leading-relaxed">{{ notice }}</p>
    <p v-if="error" role="alert" class="border-error/30 bg-error/5 text-base-content/90 mt-3 rounded-md border px-3 py-2 text-[13px] leading-relaxed">
      {{ error }}
    </p>
  </section>
</template>
