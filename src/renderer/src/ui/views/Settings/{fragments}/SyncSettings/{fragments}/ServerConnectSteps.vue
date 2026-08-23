<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, useTemplateRef} from "vue"

import {SYNC_PROTOCOL_CONFIG} from "@shared/config/syncProtocol"
import {useSyncServerStore} from "@/stores/syncServer.store"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon"
import BaseInput from "@/ui/base/BaseInput.vue"

import type {EnrollmentTicketView, ServerProbeView} from "@shared/types/syncServer"
import type {ConnectStep} from "./connectSteps"

const CODE_LENGTH = SYNC_PROTOCOL_CONFIG.codeLength
const CODE_LAST_INDEX = CODE_LENGTH - 1

const POLL_INTERVAL_MS = 2_000

const step = defineModel<ConnectStep>("step", {required: true})
const emit = defineEmits<{bound: []}>()

const syncServerStore = useSyncServerStore()

const baseUrl = ref("")
const deviceName = ref("")
const codeDigits = ref<string[]>(Array(CODE_LENGTH).fill(""))
const codeCellEls = useTemplateRef<HTMLInputElement[]>("codeCellEls")
const insecureAck = ref(false)
const fingerprintAck = ref(false)
const probeResult = ref<ServerProbeView | null>(null)
const ticket = ref<EnrollmentTicketView | null>(null)
const errorMessage = ref<string | null>(null)
const isLoading = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null

const code = computed(() => codeDigits.value.join(""))

const needsInsecureAck = computed(() => probeResult.value?.transport.mode === "plain" && probeResult.value.transport.addressIsPublic)
const needsFingerprintAck = computed(() => probeResult.value?.transport.mode === "self-signed")

const transportLabel = computed(() => {
  switch (probeResult.value?.transport.mode) {
    case "trusted-tls":
      return "Encrypted — trusted certificate"
    case "self-signed":
      return "Encrypted — self-signed certificate"
    case "plain":
      return "Not encrypted — plain HTTP"
    default:
      return ""
  }
})

const canContinueFromConfirm = computed(() => {
  if (!deviceName.value.trim()) return false
  if (needsInsecureAck.value && !insecureAck.value) return false
  if (needsFingerprintAck.value && !fingerprintAck.value) return false
  return true
})

async function onProbe() {
  if (!baseUrl.value.trim() || isLoading.value) return

  errorMessage.value = null
  isLoading.value = true
  try {
    probeResult.value = await syncServerStore.probe(baseUrl.value.trim())
    step.value = "confirm"
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    isLoading.value = false
  }
}

async function onConfirm() {
  if (!canContinueFromConfirm.value || !probeResult.value || isLoading.value) return

  if (!probeResult.value.claimed) {
    step.value = "claim"
    return
  }

  errorMessage.value = null
  isLoading.value = true
  try {
    ticket.value = await syncServerStore.requestEnrollment(deviceName.value.trim(), insecureAck.value)
    step.value = "waiting"
    startPolling()
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    isLoading.value = false
  }
}

async function onClaim() {
  if (!code.value.trim() || isLoading.value) return

  errorMessage.value = null
  isLoading.value = true
  try {
    await syncServerStore.claim(code.value.trim(), deviceName.value.trim(), insecureAck.value)
    emit("bound")
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    isLoading.value = false
  }
}

async function onAskAgain() {
  if (isLoading.value) return

  errorMessage.value = null
  isLoading.value = true
  try {
    ticket.value = await syncServerStore.requestEnrollment(deviceName.value.trim(), insecureAck.value)
    step.value = "waiting"
    startPolling()
  } catch (error) {
    errorMessage.value = messageOf(error)
  } finally {
    isLoading.value = false
  }
}

function onTryAgain() {
  errorMessage.value = null
  step.value = "confirm"
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(pollTick, POLL_INTERVAL_MS)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

async function pollTick() {
  try {
    const result = await syncServerStore.pollEnrollment()
    if (result.state === "approved") {
      stopPolling()
      emit("bound")
    } else if (result.state === "denied") {
      stopPolling()
      step.value = "denied"
    } else if (result.state === "expired") {
      stopPolling()
      step.value = "expired"
    }
  } catch (error) {
    stopPolling()
    errorMessage.value = messageOf(error)
    step.value = "confirm"
  }
}

function focusCodeCell(index: number): void {
  codeCellEls.value?.[index]?.focus()
}

function onCodeDigitInput(index: number, event: Event): void {
  const target = event.target as HTMLInputElement
  const digit = target.value.replace(/\D/g, "").slice(-1)
  codeDigits.value[index] = digit
  target.value = digit

  if (digit && index < CODE_LAST_INDEX) focusCodeCell(index + 1)
}

function onCodeDigitKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === "Enter") {
    onClaim()
    return
  }

  if (event.key === "Backspace" && !codeDigits.value[index] && index > 0) {
    event.preventDefault()
    codeDigits.value[index - 1] = ""
    focusCodeCell(index - 1)
    return
  }

  if (event.key === "ArrowLeft" && index > 0) {
    event.preventDefault()
    focusCodeCell(index - 1)
    return
  }

  if (event.key === "ArrowRight" && index < CODE_LAST_INDEX) {
    event.preventDefault()
    focusCodeCell(index + 1)
  }
}

function onCodeDigitPaste(index: number, event: ClipboardEvent): void {
  const digits = (event.clipboardData?.getData("text") ?? "")
    .replace(/\D/g, "")
    .slice(0, CODE_LENGTH - index)
    .split("")
  if (!digits.length) return

  event.preventDefault()
  digits.forEach((digit, offset) => (codeDigits.value[index + offset] = digit))
  focusCodeCell(Math.min(index + digits.length, CODE_LAST_INDEX))
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong"

  return message.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^[A-Za-z]*Error:\s*/, "")
}

onMounted(async () => {
  deviceName.value = await syncServerStore.defaultDeviceName()
})

onBeforeUnmount(() => {
  stopPolling()
  syncServerStore.cancelConnection()
})
</script>

<template>
  <p v-if="errorMessage" class="bg-error/10 text-error mb-4 rounded-lg px-3 py-2 text-sm">{{ errorMessage }}</p>

  <div v-if="step === 'address'" class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label class="text-base-content/70 text-xs font-medium">Server address</label>
      <BaseInput v-model="baseUrl" placeholder="http://192.168.1.10:8787" focus-on-mount @keyup.enter="onProbe" />
    </div>
    <BaseButton variant="primary" size="sm" class="w-full py-1.5" :loading="isLoading" @click="onProbe">Continue</BaseButton>
  </div>

  <div v-else-if="step === 'confirm' && probeResult" class="flex flex-col gap-4">
    <div class="border-base-300 bg-base-200/40 flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div class="flex items-center justify-between">
        <span class="text-base-content/60">Server</span>
        <span class="text-base-content font-medium">{{ probeResult.serverName }}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-base-content/60">Connection</span>
        <span class="text-base-content font-medium">{{ transportLabel }}</span>
      </div>
      <div v-if="probeResult.transport.fingerprint" class="flex flex-col gap-1">
        <span class="text-base-content/60">Fingerprint</span>
        <span class="text-base-content bg-base-100 rounded px-2 py-1 font-mono text-xs break-all">{{ probeResult.transport.fingerprint }}</span>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-base-content/70 text-xs font-medium">This Mac's name</label>
      <BaseInput v-model="deviceName" placeholder="Device name" />
    </div>

    <label v-if="needsFingerprintAck" class="flex cursor-pointer items-start gap-2 text-sm">
      <input v-model="fingerprintAck" type="checkbox" class="accent-accent mt-0.5" />
      <span class="text-base-content/80">This is the fingerprint the server's console printed</span>
    </label>

    <label v-if="needsInsecureAck" class="flex cursor-pointer items-start gap-2 text-sm">
      <input v-model="insecureAck" type="checkbox" class="accent-accent mt-0.5" />
      <span class="text-base-content/80">I understand this address is reachable from the internet and the connection is unencrypted</span>
    </label>

    <BaseButton variant="primary" size="sm" class="w-full py-1.5" :disabled="!canContinueFromConfirm" :loading="isLoading" @click="onConfirm">
      Continue
    </BaseButton>
  </div>

  <div v-else-if="step === 'claim'" class="flex flex-col gap-4">
    <p class="text-base-content/60 text-center text-sm">
      Enter the code shown on <span class="text-base-content font-medium">the server's console</span>
    </p>

    <div v-focus-on-mount class="flex items-center justify-center gap-2" role="group" :aria-label="`${CODE_LENGTH}-digit claim code`">
      <template v-for="(_, index) in CODE_LENGTH" :key="index">
        <span v-if="index === 3" class="text-base-content/30 select-none" aria-hidden="true">–</span>
        <input
          ref="codeCellEls"
          :value="codeDigits[index]"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="1"
          :aria-label="`Digit ${index + 1} of ${CODE_LENGTH}`"
          class="border-base-300 bg-base-200 text-base-content focus-visible-accent size-11 rounded-xl border text-center font-mono text-lg outline-none"
          @input="onCodeDigitInput(index, $event)"
          @keydown="onCodeDigitKeydown(index, $event)"
          @paste="onCodeDigitPaste(index, $event)"
        />
      </template>
    </div>

    <BaseButton variant="primary" size="sm" class="w-full py-1.5" :disabled="!code.trim()" :loading="isLoading" @click="onClaim">Connect</BaseButton>
  </div>

  <div v-else-if="step === 'waiting' && ticket" class="flex flex-col items-center gap-4 py-2 text-center">
    <h3 class="text-base-content text-base font-semibold">Confirm on your other Mac</h3>
    <p class="text-base-content/60 text-sm">Match this code with the one next to <span class="text-base-content font-medium">Approve</span> there</p>

    <div class="border-base-300 bg-base-200 w-full rounded-2xl border px-6 py-8">
      <p class="text-base-content text-center font-mono text-4xl font-semibold tracking-[0.35em]">{{ ticket.code }}</p>
    </div>

    <div class="text-base-content/50 flex items-center gap-1.5 text-xs">
      <BaseIcon name="spinner" class="size-3.5 animate-spin" />
      Waiting for approval…
    </div>
  </div>

  <div v-else-if="step === 'denied'" class="flex flex-col items-center gap-3 py-2 text-center">
    <BaseIcon name="alert-circle" class="text-error size-7" />
    <p class="text-base-content/70 text-sm">The other Mac declined this request.</p>
    <BaseButton variant="secondary" size="sm" class="w-full py-1.5" @click="onTryAgain">Try Again</BaseButton>
  </div>

  <div v-else-if="step === 'expired'" class="flex flex-col items-center gap-3 py-2 text-center">
    <BaseIcon name="alert-circle" class="text-warning size-7" />
    <p class="text-base-content/70 text-sm">This request expired before it was answered.</p>
    <BaseButton variant="primary" size="sm" class="w-full py-1.5" :loading="isLoading" @click="onAskAgain">Ask again</BaseButton>
  </div>
</template>
