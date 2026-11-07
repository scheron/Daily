<script setup lang="ts">
import {computed, onBeforeUnmount, ref, useTemplateRef, watch} from "vue"
import {useDocumentVisibility, usePreferredReducedMotion} from "@vueuse/core"

import BaseButton from "@/ui/base/BaseButton"

import type {WhatsNewMedia} from "@shared/types/update"

const props = defineProps<{media: WhatsNewMedia[]}>()

const index = ref(0)
const imagePlayback = ref<boolean | null>(null)
const isVideoPlaying = ref(false)
const hasError = ref(false)
const videoRef = useTemplateRef<HTMLVideoElement>("video")
const stillRef = useTemplateRef<HTMLCanvasElement>("still")

const reducedMotion = usePreferredReducedMotion()

const activeIndex = computed(() => Math.min(index.value, props.media.length - 1))
const active = computed(() => props.media[activeIndex.value])
const label = computed(() => active.value?.label || "Release preview")
const isVideo = computed(() => active.value?.kind === "video")
const isImagePlaying = computed(() => imagePlayback.value ?? reducedMotion.value !== "reduce")
const isPlaying = computed(() => (isVideo.value ? isVideoPlaying.value : isImagePlaying.value))
const hasPlaybackControl = computed(() => {
  const media = active.value
  if (!media || hasError.value) return false
  if (media.kind !== "image") return true
  return !/\.(?:avif|jpe?g|png|webp)$/i.test(URL.parse(media.url)?.pathname ?? "")
})
const playbackLabel = computed(() => (isPlaying.value ? "Pause preview" : "Play preview"))

const visibility = useDocumentVisibility()

function changePreview(step: number) {
  index.value = (activeIndex.value + step + props.media.length) % props.media.length
}

function togglePlayback() {
  const video = videoRef.value
  if (!video) {
    imagePlayback.value = !isImagePlaying.value
    return
  }
  if (video.paused) {
    void video.play().catch(() => {
      if (video === videoRef.value && video.error) handleError()
    })
    return
  }
  pauseVideo()
}

function pauseVideo() {
  videoRef.value?.pause()
  isVideoPlaying.value = false
}

function handleError() {
  pauseVideo()
  hasError.value = true
}

watch(
  active,
  () => {
    pauseVideo()
    imagePlayback.value = null
    hasError.value = false
  },
  {flush: "sync"},
)

watch(
  visibility,
  (value) => {
    if (value === "hidden") pauseVideo()
  },
  {flush: "sync"},
)

watch(reducedMotion, () => {
  imagePlayback.value = null
})

watch(
  [stillRef, active],
  ([canvas, media], _, onCleanup) => {
    if (!canvas || !media) return
    const image = new Image()
    function releaseImage() {
      image.onload = null
      image.onerror = null
      image.removeAttribute("src")
    }
    onCleanup(releaseImage)

    image.referrerPolicy = "no-referrer"
    image.onload = () => {
      const scale = Math.min(1, 768 / image.naturalWidth, 432 / image.naturalHeight)
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
      releaseImage()
    }
    image.onerror = handleError
    image.src = media.url
  },
  {flush: "post"},
)

onBeforeUnmount(pauseVideo)
</script>

<template>
  <figure v-if="active" aria-label="Release media" class="min-w-0 space-y-1.5">
    <div class="bg-base-200 grid min-h-14 place-items-center overflow-hidden rounded-lg">
      <p v-if="hasError" role="status" class="text-base-content/60 px-2 py-3 text-xs">Preview unavailable</p>
      <video
        v-else-if="isVideo"
        :key="active.url"
        ref="video"
        class="block max-h-[min(11rem,30vh)] w-full object-contain"
        :aria-label="label"
        :src="active.url"
        :poster="active.poster"
        preload="metadata"
        muted
        playsinline
        disablepictureinpicture
        @contextmenu.prevent
        @play="isVideoPlaying = true"
        @pause="isVideoPlaying = false"
        @ended="isVideoPlaying = false"
        @error="handleError"
      />
      <template v-else-if="visibility !== 'hidden'">
        <img
          v-if="isImagePlaying"
          :key="active.url"
          class="block max-h-[min(11rem,30vh)] w-full object-contain"
          :src="active.url"
          :alt="label"
          referrerpolicy="no-referrer"
          @error="handleError"
        />
        <canvas v-else :key="active.url" ref="still" role="img" :aria-label="label" class="block max-h-[min(11rem,30vh)] w-full object-contain" />
      </template>
    </div>

    <figcaption class="flex min-h-6 items-center gap-1.5">
      <span class="text-base-content/60 min-w-0 flex-1 truncate text-xs" :title="label">{{ label }}</span>
      <BaseButton
        v-if="hasPlaybackControl"
        size="xs"
        variant="ghost-muted"
        :icon="isPlaying ? 'pause' : 'play'"
        :aria-label="playbackLabel"
        :tooltip="playbackLabel"
        @click="togglePlayback"
      />
      <template v-if="media.length > 1">
        <BaseButton
          size="xs"
          variant="ghost-muted"
          icon="chevron-left"
          aria-label="Previous preview"
          tooltip="Previous preview"
          @click="changePreview(-1)"
        />
        <span class="text-base-content/60 shrink-0 text-xs tabular-nums" aria-live="polite">{{ activeIndex + 1 }} / {{ media.length }}</span>
        <BaseButton size="xs" variant="ghost-muted" icon="chevron-right" aria-label="Next preview" tooltip="Next preview" @click="changePreview(1)" />
      </template>
    </figcaption>
  </figure>
</template>
