<script setup lang="ts">
import {computed, onMounted, onScopeDispose, ref, watch} from "vue"
import {useDocumentVisibility, useMutationObserver} from "@vueuse/core"

import {useBaseModal} from "@/composables/useBaseModal"
import {useUpdateStore} from "@/stores/update"
import BaseButton from "@/ui/base/BaseButton"
import BaseIcon from "@/ui/base/BaseIcon.vue"
import {useWhatsNewRelease} from "./composables/useWhatsNewRelease"
import WhatsNewMedia from "./{fragments}/WhatsNewMedia.vue"

const updateStore = useUpdateStore()

const presentation = ref<"pending" | "recording" | "interrupted" | "shown">("pending")
const nativeWindowVisible = ref<boolean | null>(null)
const hasBlockingElement = ref(false)

const release = useWhatsNewRelease()
const documentVisibility = useDocumentVisibility()
const {stack: modals} = useBaseModal()

const body = computed(() => (release.value ? document.body : null))
const canShow = computed(() => {
  return (
    !!release.value &&
    presentation.value !== "interrupted" &&
    nativeWindowVisible.value === true &&
    documentVisibility.value === "visible" &&
    !hasBlockingElement.value &&
    !modals.value.length &&
    !updateStore.isPanelVisible
  )
})

const stopVisibilityListener = window.BridgeIPC["window:on-visibility-changed"]((visible) => {
  nativeWindowVisible.value = visible
})

function refreshBlockingElement() {
  hasBlockingElement.value = Boolean(document.querySelector("dialog[open]"))
}

async function markShown() {
  if (presentation.value !== "pending" || !canShow.value || !release.value) return

  presentation.value = "recording"
  try {
    const recorded = await window.BridgeIPC["whats-new:mark-shown"](release.value.version)
    if (recorded && !canShow.value) release.value = null
    presentation.value = recorded ? "shown" : "pending"
  } catch (error) {
    presentation.value = "pending"
    console.error("Failed to record the What's New card as shown:", error)
  }
}

function dismiss() {
  void markShown()
  release.value = null
}

function openRelease() {
  if (!release.value) return
  void markShown()
  void window.BridgeIPC["shell:open-external"](release.value.releaseUrl)
}

useMutationObserver(body, refreshBlockingElement, {attributes: true, attributeFilter: ["open"], childList: true, subtree: true})

watch(release, (notes) => {
  if (notes) refreshBlockingElement()
})

watch(
  canShow,
  (visible, _, onCleanup) => {
    if (!visible) {
      if (presentation.value === "shown") release.value = null
      if (presentation.value === "recording") presentation.value = "interrupted"
      return
    }

    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void markShown())
    })
    onCleanup(() => cancelAnimationFrame(frame))
  },
  {flush: "post"},
)

onMounted(async () => {
  try {
    const visible = await window.BridgeIPC["window:is-visible"]()
    nativeWindowVisible.value ??= visible
  } catch (error) {
    console.error("Failed to read window visibility for What's New:", error)
  }
})

onScopeDispose(stopVisibilityListener)
</script>

<template>
  <Teleport to="body">
    <section
      v-if="canShow && release"
      aria-labelledby="whats-new-title"
      class="border-base-300 bg-base-100/90 fixed bottom-4 right-4 z-50 flex max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100dvw-2rem)] flex-col gap-3 overflow-y-auto rounded-2xl border px-4 py-3 shadow-2xl"
    >
      <header class="flex shrink-0 items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <BaseIcon name="sparkles" class="text-accent size-4 shrink-0" />
          <h2 id="whats-new-title" class="text-sm font-semibold">What's new in Daily {{ release.version }}</h2>
        </div>

        <BaseButton type="button" variant="ghost-muted" icon="x-mark" size="xs" aria-label="Dismiss What's New" tooltip="Dismiss" @click="dismiss" />
      </header>

      <ul class="text-base-content/70 wrap-break-word shrink-0 list-disc space-y-1 pl-5 text-sm leading-snug">
        <li v-for="highlight in release.highlights" :key="highlight">{{ highlight }}</li>
      </ul>

      <WhatsNewMedia v-if="release.media.length" :media="release.media" />

      <BaseButton type="button" variant="secondary" size="sm" class="shrink-0 self-end" @click="openRelease">
        Learn more
        <BaseIcon name="external-link" class="size-3" />
      </BaseButton>
    </section>
  </Teleport>
</template>
