<script setup lang="ts">
import {BaseIcon} from "@daily/ui/base"
import {Logo} from "@daily/ui/misc"

import type {Theme} from "@daily/types/theme"

defineProps<{
  theme: Theme
  selected: boolean
}>()
</script>

<template>
  <button
    class="group border-base-300 hover:border-accent focus-visible:ring-accent relative flex w-[140px] max-w-[140px] min-w-[140px] flex-shrink-0 flex-col items-center rounded-lg border p-2 transition-colors outline-none focus-visible:ring-2"
    :class="{'border-accent shadow-lg': selected}"
    tabindex="0"
  >
    <div
      class="relative flex h-20 w-full overflow-hidden rounded-md border"
      :style="{borderColor: theme.colorScheme['base-300'], backgroundColor: theme.colorScheme['base-100']}"
    >
      <div
        class="flex flex-col gap-0.5 border-r py-0.5"
        :style="{width: '20%', borderColor: theme.colorScheme['base-300'], backgroundColor: theme.colorScheme['base-100']}"
      >
        <div class="flex w-full items-center justify-between border-b pr-0.5 pb-0.5 pl-1" :style="{borderColor: theme.colorScheme['base-300']}">
          <Logo class="size-1.5" :style="{color: theme.colorScheme['accent']}" />
          <div class="size-1 rounded-full" :style="{backgroundColor: theme.colorScheme['base-200']}" />
        </div>

        <div class="mx-1 mt-0.5 mb-0.5 h-0.5 w-2 rounded-full" :style="{backgroundColor: theme.colorScheme['base-content']}" />

        <div class="flex w-full flex-1 flex-col px-0.5">
          <div class="flex h-1/3 w-full flex-col gap-[2px] p-[1px]" :style="{backgroundColor: theme.colorScheme['base-300']}">
            <div class="h-[1px] w-full" :style="{backgroundColor: theme.colorScheme['accent']}"></div>
            <div class="h-[1px] w-full" :style="{backgroundColor: theme.colorScheme['base-200']}"></div>
            <div class="h-[1px] w-full" :style="{backgroundColor: theme.colorScheme['base-200']}"></div>
            <div class="h-[1px] w-full" :style="{backgroundColor: theme.colorScheme['base-200']}">
              <div class="ml-1 h-[1px] w-[2px]" :style="{backgroundColor: theme.colorScheme['accent']}"></div>
            </div>
            <div class="h-[1px] w-full" :style="{backgroundColor: theme.colorScheme['base-200']}"></div>
            <div class="h-[1px] w-full" :style="{backgroundColor: theme.colorScheme['base-200']}"></div>
          </div>
          <div class="mt-auto flex h-1 w-full items-center justify-between px-[2px]" :style="{backgroundColor: theme.colorScheme['base-200']}">
            <div class="h-[2px] w-[2px]" :style="{backgroundColor: theme.colorScheme['base-content']}"></div>
            <div class="h-[2px] w-[2px]" :style="{backgroundColor: theme.colorScheme['base-content']}"></div>
          </div>
        </div>
      </div>

      <div class="flex flex-1 flex-col gap-0.5 py-0.5 pr-0.5 pl-0.5">
        <div class="mb-0.5 pb-1 flex items-center gap-0.5 border-b" :style="{borderColor: theme.colorScheme['base-300']}">
          <div class="rounded-sm" :style="{width: '35%', height: '2px', backgroundColor: theme.colorScheme['base-content'], opacity: 0.3}" />
          <div class="ml-auto rounded-sm" :style="{width: '10px', height: '2px', backgroundColor: theme.colorScheme.accent}" />
        </div>

        <div class="mb-0.5 flex items-center justify-between gap-0.5 px-0.5">
          <div class="rounded-sm" :style="{width: '28%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          <div class="rounded-sm" :style="{width: '28%', height: '3px', backgroundColor: theme.colorScheme['base-300']}" />
        </div>

        <div class="flex flex-1 flex-col gap-0.5 rounded-md p-0.5" :style="{backgroundColor: theme.colorScheme['base-200']}">
          <div class="flex h-4 w-full flex-col gap-0.5 rounded-sm p-1" :style="{backgroundColor: theme.colorScheme['base-100']}">
            <div class="rounded-sm" :style="{width: '80%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
            <div class="mt-0.5 rounded-sm" :style="{width: '52%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          </div>

          <div class="flex h-3 w-full flex-col gap-0.5 rounded-sm p-1" :style="{backgroundColor: theme.colorScheme['base-100']}">
            <div class="rounded-sm" :style="{width: '20%', height: '2px', backgroundColor: theme.colorScheme['base-content']}" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-1 flex w-full items-center justify-center">
      <BaseIcon v-if="selected" name="check" class="text-accent ml-1 size-4" />
      <span class="text-base-content truncate text-xs font-medium">{{ theme.name }}</span>
    </div>
  </button>
</template>
