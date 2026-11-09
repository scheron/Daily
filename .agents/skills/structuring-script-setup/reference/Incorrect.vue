<!-- ❌ the attributes go `setup lang="ts"` -->
<script lang="ts" setup>
// Same component as Correct.vue, with its sections out of place.
// Each ❌ marks a violation.

import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue"
import {useElementSize, useEventListener} from "@vueuse/core"

import {useTasksStore} from "@/stores/tasks"
import BaseButton from "@/ui/base/BaseButton"

import type {Task} from "@daily/protocol"

const props = defineProps<{taskId: Task["id"]; autoStart?: boolean}>()
const emit = defineEmits<{commit: []}>()

const panelRef = ref<HTMLElement | null>(null) // ❌ template ref through ref() instead of useTemplateRef("panel")
const startedAt = ref<number | null>(null)

const tasksStore = useTasksStore() // ❌ store below refs (stores are 6, refs 7)

defineExpose({start, reset}) // ❌ defineExpose must be dead last, not near the top

const label = computed(() => tasksStore.findTaskById(props.taskId)?.content ?? "")

useEventListener(window, "keydown", onKeydown) // ❌ subscription registered above the named handler it passes

function start() {
  // ❌ method wedged between computeds
  suppressCommit = false
  startedAt.value = Date.now()
  nowMs.value = Date.now()
  panelRef.value?.scrollIntoView({block: "nearest"})
}

const nowMs = ref(0) // ❌ ref stranded among methods and computeds
type UndoPhase = "idle" | "counting" | "expired" // ❌ type mid-file — belongs above constants
const UNDO_WINDOW_MS = 5_000 // ❌ constant mid-file

const remainingMs = computed(() => {
  if (startedAt.value === null) return UNDO_WINDOW_MS
  return Math.max(0, UNDO_WINDOW_MS - (nowMs.value - startedAt.value))
})

onMounted(() => {
  // ❌ lifecycle in the middle of the file
  if (props.autoStart) start()
  tickTimer = window.setInterval(() => (nowMs.value = Date.now()), 250)
})

let suppressCommit = false // ❌ instance state near the bottom (belongs at 5)
let tickTimer = 0

const open = defineModel<boolean>("open", {required: true}) // ❌ defineModel split from the rest of the contract (4)

const progress = computed(() => 1 - remainingMs.value / UNDO_WINDOW_MS)
const phase = computed<UndoPhase>(() => {
  if (startedAt.value === null) return "idle"
  return remainingMs.value > 0 ? "counting" : "expired"
})

watch(phase, (value) => {
  // ❌ watcher between computeds and methods
  if (value === "expired") commit()
})

function reset() {
  startedAt.value = null
}

const {width} = useElementSize(panelRef) // ❌ composable after methods and watchers

function undo() {
  reset()
  open.value = false
}

function commit() {
  if (suppressCommit) return
  emit("commit")
  reset()
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && phase.value === "counting") undo()
}

watch(
  () => props.taskId,
  () => panelRef.value?.scrollIntoView({block: "nearest"}),
) // ❌ second watcher scattered away from the first

useEventListener(document, "visibilitychange", () => (nowMs.value = Date.now())) // ❌ an inline callback passes no method — this subscription sits with the composables (9)

onBeforeUnmount(() => {
  // ❌ paired lifecycle split from its onMounted
  suppressCommit = true
  window.clearInterval(tickTimer)
})
</script>

<template>
  <!-- ❌ class logic assembled in the template instead of a panelClass computed returning cn(...) -->
  <div
    v-if="open"
    ref="panelRef"
    role="status"
    class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
    :class="[phase === 'expired' ? 'text-base-content/40' : 'bg-accent/15 text-accent']"
  >
    <span class="min-w-0 truncate">{{ label }}</span>
    <span class="tabular-nums">{{ Math.round(progress * 100) }}%</span>
    <BaseButton variant="primary-ghost" :disabled="phase !== 'counting' || width < 120" @click="undo">Undo</BaseButton>
  </div>
</template>
