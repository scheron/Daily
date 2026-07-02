<script setup lang="ts">
import {computed} from "vue"

import {useUpdateStore} from "@/stores/update.store"

import SettingRow from "../../SettingRow.vue"

const REPOSITORY_URL = "https://github.com/scheron/Daily"

const updateStore = useUpdateStore()

const version = computed(() => updateStore.state.currentVersion || "—")
</script>

<template>
  <div>
    <SettingRow title="Source" description="Code, issues and releases.">
      <a
        class="text-base-content/60 hover:text-accent text-xs underline-offset-2 hover:underline"
        :href="REPOSITORY_URL"
        target="_blank"
        rel="noopener noreferrer"
      >
        github.com/scheron/Daily
      </a>
    </SettingRow>

    <SettingRow title="Version">
      <span class="text-base-content/60 text-xs tabular-nums">{{ version }}</span>
    </SettingRow>

    <SettingRow title="License">
      <span class="text-base-content/60 text-xs">MIT</span>
    </SettingRow>
  </div>
</template>
