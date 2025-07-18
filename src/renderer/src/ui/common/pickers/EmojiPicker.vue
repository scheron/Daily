<script setup lang="ts">
import BaseButton from "@/ui/base/BaseButton.vue"

const props = withDefaults(defineProps<{selectedEmoji?: string}>(), {
  selectedEmoji: "",
})

const emit = defineEmits<{selected: [emoji: string]; clear: []}>()

// prettier-ignore
const EMOJIS = [
  "🏷️", "📌", "⭐", "💡", "🎯", "🔥", "💎", "🌟", "✨", "💫", "🎨", "🎭", "🎪", "🎟️", "🎫",
  "😊", "😍", "🥰", "😎", "🤩", "😇", "🤗", "😌", "😴", "🤔", "😏", "😉", "😋", "🤤",
  "🌸", "🌺", "🌻", "🌹", "🌷", "🌼", "🌿", "🍀", "🌱", "🌲", "🌳", "🌴", "🌵", "🌾", "🌽",
  "🍕", "🍔", "🍟", "🌭", "🍿", "🧂", "🥨", "🥯", "🥖", "🧀", "🥚", "🥓", "🥩", "🍗", "🍖",
  "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🏊", "🏃", "🚴", "⛷️", "🏂",
  "💻", "📱", "⌚", "📷", "🎥", "📺", "📻", "🎧", "🎤", "🎵", "🎶", "🎹", "🎸", "🎺", "🎻",
  "✈️", "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "🚜", "🛵",
  "💼", "📁", "📂", "📄", "📋", "📝", "✏️", "🖊️", "🖋️", "✒️", "🖌️", "🖍️", "📎", "🖇️", "📐",
  "⚛️", "🔬", "🧪", "🧫", "🧬", "🔭", "📡", "💉", "🩺", "🩻", "🛡️", "⚔️", "🗡️", "🔪", "⚖️",
  "🎮", "🎲", "🎳", "🎢", "🎡", "🎠", "🎬", "🎰", "🎪", "🎭", "🎨", "🎪", "🎭", "🎨", "🎬",
  "🐶", "🐱", "🐰", "🐹", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐢", "🦜"
]

function selectEmoji(emoji: string) {
  if (props.selectedEmoji === emoji) emit("clear")
  else emit("selected", emoji)
}
</script>

<template>
  <div class="grid grid-cols-9">
    <BaseButton
      v-for="emoji in EMOJIS"
      :key="emoji"
      size="sm"
      class="size-8 text-lg"
      variant="ghost"
      :class="props.selectedEmoji === emoji ? 'ring-primary/50 ring-2' : ''"
      @click="selectEmoji(emoji)"
    >
      {{ emoji }}
    </BaseButton>
  </div>
</template>
