<script setup lang="ts">
import {computed, onMounted, ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {useEventListener} from "@vueuse/core"

import {DEFAULT_QUICK_TASK_HOTKEY} from "@daily/protocol"

import {useSettingValue} from "@/composables/useSettingValue"
import {useSettingsStore} from "@/stores/settings.store"
import BaseButton from "@/ui/base/BaseButton"
import SettingRow from "@/ui/views/Settings/{fragments}/SettingRow.vue"
import {toAcceleratorKeyCaps} from "@/utils/shortcuts/toAcceleratorKeyCaps"
import {formatEventToAccelerator} from "@shared/utils/shortcuts/formatEventToAccelerator"
import {isValidAccelerator} from "@shared/utils/shortcuts/isValidAccelerator"

const settingsStore = useSettingsStore()

const hotkey = useSettingValue("quickTask.hotkey", DEFAULT_QUICK_TASK_HOTKEY)

const isRecording = ref(false)
const draft = ref("")
const held = ref("")
const activeHotkey = ref<string | null>(null)
const isLoaded = ref(false)
const isProcessRunning = ref(true)

const caps = computed(() => toAcceleratorKeyCaps(isRecording.value ? held.value : hotkey.value))
const isDefault = computed(() => hotkey.value === DEFAULT_QUICK_TASK_HOTKEY)
const isInactive = computed(() => isLoaded.value && !isRecording.value && activeHotkey.value !== hotkey.value)
const inactiveReason = computed(() =>
  isProcessRunning.value
    ? "Not active: another app already uses this shortcut. Choose another one."
    : "Not active: Quick task is not running. It starts again the next time the main window opens.",
)

useEventListener(window, "keydown", onKeyDown)
useEventListener(window, "keyup", onKeyUp)

function startRecording() {
  isRecording.value = true
  draft.value = ""
  held.value = ""
}

function stopRecording() {
  isRecording.value = false
  draft.value = ""
  held.value = ""
}

async function rebind(accelerator: string, successMessage: string) {
  const result = await window.BridgeIPC["quick-task:rebind-hotkey"](accelerator)

  if (result.ok) {
    isProcessRunning.value = true
    activeHotkey.value = accelerator
    await settingsStore.revalidate()
    toasts.success(successMessage)
    stopRecording()
    return
  }

  isProcessRunning.value = result.reason !== "not-running"
  activeHotkey.value = result.active
  toasts.error(getFailureMessage(result.reason, result.active))
  draft.value = ""
  held.value = ""
}

function getFailureMessage(reason: "invalid" | "unavailable" | "not-running", active: string | null) {
  if (reason === "not-running") return "Quick task is not running right now, so the shortcut could not be changed. Try again in a moment."
  if (reason === "invalid") return "That combination can't be used as a shortcut."
  if (active) return "That combination is taken by another app. The previous shortcut is still active."
  return "That combination is taken by another app. Quick task has no active shortcut."
}

function onKeyDown(event: KeyboardEvent) {
  if (!isRecording.value) return

  event.preventDefault()
  event.stopPropagation()

  if (event.key === "Escape") return stopRecording()

  const accelerator = formatEventToAccelerator(event)

  if (accelerator && isValidAccelerator(accelerator)) {
    draft.value = accelerator
    held.value = accelerator
    return
  }

  held.value = [event.metaKey && "Command", event.ctrlKey && "Control", event.altKey && "Alt", event.shiftKey && "Shift"].filter(Boolean).join("+")
}

function onKeyUp(event: KeyboardEvent) {
  if (!isRecording.value) return

  event.preventDefault()
  event.stopPropagation()

  if (draft.value) return void rebind(draft.value, "Quick task shortcut changed")

  if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) held.value = ""
}

onMounted(async () => {
  const state = await window.BridgeIPC["quick-task:active-hotkey"]()
  isProcessRunning.value = state.running
  activeHotkey.value = state.active
  isLoaded.value = true
})
</script>

<template>
  <SettingRow title="Quick task shortcut" description="Opens the Quick task panel from any app">
    <template v-if="isInactive" #description>
      <p class="text-warning text-xs">{{ inactiveReason }}</p>
    </template>

    <div class="flex items-center gap-2">
      <BaseButton
        variant="outline"
        size="sm"
        :tooltip="isRecording ? 'Press Esc to cancel' : 'Change shortcut'"
        @click="isRecording ? stopRecording() : startRecording()"
      >
        <template v-if="isRecording && !caps.length">Press new shortcut</template>
        <kbd v-for="(cap, index) in caps" v-else :key="index" class="font-mono text-[11px]">{{ cap }}</kbd>
      </BaseButton>

      <BaseButton
        v-if="!isDefault && !isRecording"
        variant="ghost-muted"
        size="sm"
        icon="undo"
        tooltip="Reset to default"
        @click="rebind(DEFAULT_QUICK_TASK_HOTKEY, 'Quick task shortcut reset')"
      />
    </div>
  </SettingRow>
</template>
