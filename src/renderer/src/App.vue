<script setup lang="ts">
import {Toaster} from "vue-sonner"

import {IconsSprite} from "@/ui/base/BaseIcon"
</script>

<template>
  <RouterView />

  <IconsSprite />
  <Toaster class="toaster" :duration="3000" close-button />
</template>
